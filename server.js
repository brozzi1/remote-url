const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");

const app = express();
const PORT = process.env.PORT || 10000;

const DOWNLOAD_DIR = path.join(__dirname, "downloads");

if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR);
}

function formatBytes(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Byte';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
}

app.get("/", (req, res) => {
    res.send("VikingFile Upload API Running");
});

app.get("/upload", async (req, res) => {

    const remoteUrl = req.query.url;

    if (!remoteUrl) {
        return res.json({
            success: false,
            error: "Missing url parameter"
        });
    }

    try {

        // -------------------------
        // STEP 1 DOWNLOAD FILE
        // -------------------------

        const parsed = new URL(remoteUrl);

        let fileName = path.basename(parsed.pathname);

        if (!fileName) {
            fileName = `file_${Date.now()}`;
        }

        const filePath = path.join(DOWNLOAD_DIR, fileName);

        console.log("Downloading:", remoteUrl);

        const response = await axios({
            method: "GET",
            url: remoteUrl,
            responseType: "stream"
        });

        const totalLength = response.headers['content-length'];

        let downloaded = 0;

        const writer = fs.createWriteStream(filePath);

        response.data.on("data", (chunk) => {

            downloaded += chunk.length;

            if (totalLength) {

                const percent = (
                    downloaded / totalLength * 100
                ).toFixed(2);

                process.stdout.write(
                    `\rDownload Progress: ${percent}% | ${formatBytes(downloaded)} / ${formatBytes(totalLength)}`
                );
            }
        });

        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on("finish", resolve);
            writer.on("error", reject);
        });

        console.log("\nDownload Complete");

        // -------------------------
        // STEP 2 GET VIKING SERVER
        // -------------------------

        const serverRes = await axios.get(
            "https://vikingfile.com/api/get-server"
        );

        const uploadServer = serverRes.data.server;

        console.log("Upload Server:", uploadServer);

        // -------------------------
        // STEP 3 UPLOAD FILE
        // -------------------------

        const form = new FormData();

        form.append(
            "file",
            fs.createReadStream(filePath)
        );

        form.append("user", "");

        const stats = fs.statSync(filePath);

        console.log(
            `Uploading ${formatBytes(stats.size)}`
        );

        const uploadRes = await axios.post(
            uploadServer,
            form,
            {
                headers: form.getHeaders(),
                maxBodyLength: Infinity,
                maxContentLength: Infinity,

                onUploadProgress: (progressEvent) => {

                    if (progressEvent.total) {

                        const percent = (
                            progressEvent.loaded /
                            progressEvent.total * 100
                        ).toFixed(2);

                        process.stdout.write(
                            `\rUpload Progress: ${percent}% | ${formatBytes(progressEvent.loaded)} / ${formatBytes(progressEvent.total)}`
                        );
                    }
                }
            }
        );

        console.log("\nUpload Complete");

        // -------------------------
        // FINAL RESPONSE
        // -------------------------

        res.json({
            success: true,
            uploaded: uploadRes.data
        });

    } catch (err) {

        console.error(err);

        res.json({
            success: false,
            error: err.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
});
