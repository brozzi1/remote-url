const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

const DOWNLOAD_DIR = path.join(__dirname, "downloads");

if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR);
}

// Home
app.get("/", (req, res) => {
  res.send(`
    <h2>Render URL Downloader API</h2>
    <p>Usage:</p>
    <code>/download?url=https://example.com/file.zip</code>
  `);
});

// Download API
app.get("/download", async (req, res) => {
  try {
    const fileUrl = req.query.url;

    if (!fileUrl) {
      return res.status(400).json({
        success: false,
        error: "Missing url parameter"
      });
    }

    const parsed = new URL(fileUrl);

    let fileName = path.basename(parsed.pathname);

    if (!fileName || fileName === "/") {
      fileName = `file_${Date.now()}`;
    }

    const savePath = path.join(DOWNLOAD_DIR, fileName);

    const response = await axios({
      method: "GET",
      url: fileUrl,
      responseType: "stream",
      timeout: 0,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    const writer = fs.createWriteStream(savePath);

    response.data.pipe(writer);

    writer.on("finish", () => {
      res.json({
        success: true,
        filename: fileName,
        saved_to: savePath
      });
    });

    writer.on("error", (err) => {
      res.status(500).json({
        success: false,
        error: err.message
      });
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
