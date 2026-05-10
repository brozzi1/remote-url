const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 10000;

const DOWNLOAD_DIR = path.join(__dirname, "downloads");

if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR);
}

const tasks = {};

function formatBytes(bytes) {
    if (!bytes) return "0 B";

    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));

    return (
        (bytes / Math.pow(1024, i)).toFixed(2) +
        " " +
        sizes[i]
    );
}

app.use(express.static("public"));

app.get("/api/start", async (req, res) => {

    const remoteUrl = req.query.url;

    if (!remoteUrl) {
        return res.json({
            error: "Missing URL"
        });
    }

    const taskId = uuidv4();

    tasks[taskId] = {
        status: "starting",
        downloadPercent: 0,
        uploadPercent: 0,
        speed: "0 MB/s",
        result: null,
        error: null
    };

    res.json({
        taskId
    });

    processUpload(taskId, remoteUrl);
});

app.get("/api/status/:id", (req, res) => {

    const task = tasks[req.params.id];

    if (!task) {
        return res.json({
            error: "Task not found"
        });
    }

    res.json(task);
});

async function processUpload(taskId, remoteUrl) {

    try {

        // --------------------
        // DOWNLOAD
        // --------------------

        tasks[taskId].status = "downloading";

        const parsed = new URL(remoteUrl);

        let fileName = path.basename(parsed.pathname);

        if (!fileName) {
            fileName = `file_${Date.now()}`;
        }

        const filePath = path.join(DOWNLOAD_DIR, fileName);

        const response = await axios({
            method: "GET",
            url: remoteUrl,
            responseType: "stream"
        });

        const total = parseInt(
            response.headers["content-length"]
        );

        let downloaded = 0;

        const startTime = Date.now();

        response.data.on("data", chunk => {

            downloaded += chunk.length;

            const percent =
                (downloaded / total) * 100;

            const elapsed =
                (Date.now() - startTime) / 1000;

            const speed = downloaded / elapsed;

            tasks[taskId].downloadPercent =
                percent.toFixed(2);

            tasks[taskId].speed =
                formatBytes(speed) + "/s";
        });

        const writer =
            fs.createWriteStream(filePath);

        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on("finish", resolve);
            writer.on("error", reject);
        });

        // --------------------
        // GET SERVER
        // --------------------

        tasks[taskId].status = "uploading";

        const serverRes = await axios.get(
            "https://vikingfile.com/api/get-server"
        );

        const uploadServer =
            serverRes.data.server;

        // --------------------
        // UPLOAD
        // --------------------

        const form = new FormData();

        form.append(
            "file",
            fs.createReadStream(filePath)
        );

        form.append("user", "");

        const stats = fs.statSync(filePath);

        const uploadRes = await axios.post(
            uploadServer,
            form,
            {
                headers: form.getHeaders(),
                maxContentLength: Infinity,
                maxBodyLength: Infinity,

                onUploadProgress: progress => {

                    if (progress.total) {

                        const percent =
                            (
                                progress.loaded /
                                progress.total
                            ) * 100;

                        tasks[taskId].uploadPercent =
                            percent.toFixed(2);
                    }
                }
            }
        );

        tasks[taskId].status = "completed";

        tasks[taskId].result =
            uploadRes.data;

    } catch (err) {

        tasks[taskId].status = "error";

        tasks[taskId].error =
            err.message;
    }
}

app.listen(PORT, () => {
    console.log(
        "Server running on port",
        PORT
    );
});
