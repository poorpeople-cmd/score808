const http = require('http');
const axios = require('axios');
const { URL } = require('url');

const REPO = process.env.GITHUB_REPOSITORY;
const TOKEN = process.env.GITHUB_TOKEN; // GitHub API ko access karne ke liye
const REFERER = process.env.REFERER_URL;
let currentTarget = process.env.INITIAL_URL;

console.log(`\n🚀 [SYSTEM START] Initial Link: ${currentTarget.substring(0, 60)}...`);

// 🕵️‍♂️ Har 15 second baad GitHub par 'live_link.txt' file ko check karna
async function checkGitHubFile() {
    try {
        const url = `https://api.github.com/repos/${REPO}/contents/live_link.txt`;
        const res = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'Accept': 'application/vnd.github.v3.raw', // Cache bypass karke raw data lana
                'Cache-Control': 'no-cache'
            }
        });
        
        const newLink = res.data.trim();
        // Agar link naya hai aur valid (http se start hota hai)
        if (newLink && newLink !== currentTarget && newLink.startsWith('http')) {
            console.log(`\n💥 [MAGIC SWAP!] Aapne GitHub par naya link update kiya hai!`);
            console.log(`🔗 Naya Link: ${newLink.substring(0, 60)}...`);
            console.log(`✅ FFmpeg ko zero downtime ke sath naye link par transfer kar diya gaya hai.`);
            currentTarget = newLink;
        }
    } catch(e) {
        // Agar file read karne mein masla aaye toh ignore karo taake system na ruke
    }
}
setInterval(checkGitHubFile, 15000);

// 🌐 LOCAL HLS PROXY (Project 2 wala logic jo FFmpeg ko zinda rakhta hai)
const server = http.createServer(async (req, res) => {
    if (!currentTarget) { res.writeHead(503); return res.end('Not Ready'); }

    try {
        let targetUrl = currentTarget;
        if (req.url.startsWith('/proxy?target=')) {
            targetUrl = decodeURIComponent(req.url.split('target=')[1]);
        } else if (req.url !== '/live.m3u8') {
            res.writeHead(404); return res.end();
        }

        if (targetUrl.includes('.m3u8')) {
            const response = await axios.get(targetUrl, {
                responseType: 'text',
                timeout: 15000,
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36', 
                    'Referer': REFERER 
                }
            });

            const baseUrl = new URL(targetUrl);
            const rewritten = response.data.split('\n').map(line => {
                let tLine = line.trim();
                if (tLine === '') return line;
                if (tLine.startsWith('#')) {
                    return tLine.replace(/URI="(.*?)"/g, (match, p1) => {
                        let absUrl = p1.startsWith('http') ? p1 : new URL(p1, baseUrl).toString();
                        return `URI="http://127.0.0.1:8080/proxy?target=${encodeURIComponent(absUrl)}"`;
                    });
                }
                let absoluteUrl = tLine.startsWith('http') ? tLine : new URL(tLine, baseUrl).toString();
                return `http://127.0.0.1:8080/proxy?target=${encodeURIComponent(absoluteUrl)}`;
            }).join('\n');

            res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
            res.end(rewritten);
            
        } else {
            const response = await axios.get(targetUrl, {
                responseType: 'stream',
                timeout: 15000,
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36', 
                    'Referer': REFERER 
                }
            });
            res.writeHead(200, { 'Content-Type': response.headers['content-type'] || 'video/MP2T' });
            response.data.pipe(res);
        }
    } catch (err) {
        res.writeHead(500); res.end();
    }
});

server.listen(8080, () => {
    console.log(`[🌐 PROXY] Local Server Ready at http://127.0.0.1:8080`);
});
