const http = require('http');
const axios = require('axios');
const { URL } = require('url');

const REPO = process.env.GITHUB_REPOSITORY;
const TOKEN = process.env.GITHUB_TOKEN;
const REFERER = process.env.REFERER_URL;

// Global Variables
let currentTargetUrl = process.env.INITIAL_URL;
let currentPlaylistUrl = ''; 
let lastTsUrl = ''; 

console.log(`\n🚀 [SYSTEM START] Initial Link: ${currentTargetUrl.substring(0, 60)}...`);

// 🕵️‍♂️ Har 15 second baad GitHub par 'live_link.txt' check karna
async function checkGitHubFile() {
    try {
        const url = `https://api.github.com/repos/${REPO}/contents/live_link.txt`;
        const res = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'Accept': 'application/vnd.github.v3.raw',
                'Cache-Control': 'no-cache'
            }
        });
        
        const newLink = res.data.trim();
        if (newLink && newLink !== currentTargetUrl && newLink.startsWith('http')) {
            console.log(`\n💥 [MAGIC SWAP!] Naya link detect hua: ${newLink.substring(0, 60)}...`);
            currentTargetUrl = newLink;
            currentPlaylistUrl = ''; // Naya master link aaya hai, toh playlist url reset karo
        }
    } catch(e) { 
        // File read error ko ignore karein taake loop chalta rahe
    }
}
setInterval(checkGitHubFile, 15000);

// 🛠️ Master M3U8 se Asal Video M3U8 nikalna
async function getActivePlaylist() {
    if (currentPlaylistUrl) return currentPlaylistUrl;
    
    try {
        const res = await axios.get(currentTargetUrl, { headers: { 'Referer': REFERER } });
        const lines = res.data.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('.m3u8')) {
                currentPlaylistUrl = lines[i].startsWith('http') ? lines[i] : new URL(lines[i], currentTargetUrl).toString();
                return currentPlaylistUrl;
            }
        }
    } catch (e) {
        console.log("⚠️ Master Playlist fetch error:", e.message);
    }
    return currentTargetUrl; // Agar resolution list na mile toh wohi url use karo
}

// 🌐 THE BEAST: Continuous Stream Engine (Zero Downtime + Fast Fail)
const server = http.createServer(async (req, res) => {
    if (req.url !== '/stream.ts') {
        res.writeHead(404); return res.end();
    }

    console.log("🎥 FFmpeg Connected! Injecting Raw Video Stream...");
    
    // FFmpeg ko lagay ga ke woh direct MP4/TS file download kar raha hai
    res.writeHead(200, {
        'Content-Type': 'video/MP2T',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache'
    });

    let keepStreaming = true;

    // Jab FFmpeg connection tode toh rok do
    req.on('close', () => {
        console.log("🛑 FFmpeg Disconnected.");
        keepStreaming = false;
    });

    while (keepStreaming) {
        try {
            const playlistUrl = await getActivePlaylist();
            const playlistRes = await axios.get(playlistUrl, { headers: { 'Referer': REFERER } });
            
            const lines = playlistRes.data.split('\n');
            const tsLinks = [];
            
            // Saari TS files jama karna
            for (const line of lines) {
                if (line && !line.startsWith('#')) {
                    tsLinks.push(line.startsWith('http') ? line : new URL(line, playlistUrl).toString());
                }
            }

            // Nayi TS file dhoondna jo humne pehle FFmpeg ko nahi bheji
            let newTsIndex = tsLinks.indexOf(lastTsUrl);
            if (newTsIndex === -1 || newTsIndex === tsLinks.length - 1) {
                newTsIndex = Math.max(0, tsLinks.length - 3); // Agar naya aaye toh aakhri 3 se shuru karo
            } else {
                newTsIndex++; // Agla chunk bhejo
            }

            // TS files fetch karke FFmpeg ko pipe karna
            for (let i = newTsIndex; i < tsLinks.length; i++) {
                if (!keepStreaming) break;
                const tsUrl = tsLinks[i];
                
                try {
                    // 🛡️ FAST FAIL LOGIC: Sirf 3 second wait.
                    const tsRes = await axios.get(tsUrl, {
                        responseType: 'arraybuffer', // Aadha data nahi, poora memory mein lo
                        timeout: 3000, 
                        headers: { 'Referer': REFERER }
                    });
                    
                    // Chunk 100% download ho gaya, ab FFmpeg ko do
                    res.write(Buffer.from(tsRes.data)); 
                    lastTsUrl = tsUrl;
                    
                } catch (e) {
                    // ⚠️ NO RETRY IN LIVE STREAM!
                    console.log(`⚠️ Internet drop! Chunk missed. Skipping to keep LIVE edge...`);
                }
            }

            // Live stream mein aglay chunk ka aane ka wait karna (aam taur par 2-3 second)
            await new Promise(r => setTimeout(r, 2000));

        } catch (e) {
            console.log("⚠️ Playlist fetch error, retrying...");
            await new Promise(r => setTimeout(r, 2000));
        }
    }
});

server.listen(8080, () => {
    console.log(`[🌐 PROXY] Continuous Stream Engine Ready at http://127.0.0.1:8080/stream.ts`);
});
