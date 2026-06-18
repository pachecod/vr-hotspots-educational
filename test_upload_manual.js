const axios = require('axios');
const fs = require('fs');

const https = require('https');
const agent = new https.Agent({ rejectUnauthorized: false });

async function testUploads() {
    console.log("Fetching URL...");
    try {
        const res = await axios.get('https://localhost:3000/api/b2-upload-url', { httpsAgent: agent });
        const uploadUrl = res.data.uploadUrl;
        const uploadAuthToken = res.data.authorizationToken;
        console.log("Got URL:", uploadUrl);

        console.log("Uploading file...");
        const buf = Buffer.alloc(1024 * 1024, 'a'); // 1MB

        const uploadRes = await axios.post(uploadUrl, buf, {
            headers: {
                'Authorization': uploadAuthToken,
                'X-Bz-File-Name': 'test_upload_1.zip',
                'Content-Type': 'application/zip',
                'X-Bz-Content-Sha1': 'do_not_verify'
            }
        });
        console.log("Upload fixed:", uploadRes.status);
    } catch(err) {
        console.error("Failed:", err.response ? JSON.stringify(err.response.data) : err.message);
    }
}
testUploads();
