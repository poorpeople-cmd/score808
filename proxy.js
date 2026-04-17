const http = require('http');
const axios = require('axios');
const { URL } = require('url');

const REPO = process.env.GITHUB_REPOSITORY;
const TOKEN = process.env.GITHUB_TOKEN;
const REFERER = process.env.REFERER_URL;

// Global Variables
let currentTargetUrl = process.env.INITIAL_URL;
let currentPlaylistUrl = ''; 
let playedChunks = new Set(); // 🧠 THE FIX: Video ki history yaad rakhne wali memory

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
            currentPlaylistUrl = ''; 
            playedChunks.clear(); // 🧠 SWAP par memory clear karo taake naya link fresh chalu ho
        }
    } catch(e) { }
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
    return currentTargetUrl; 
}

// 🌐 THE BEAST: Continuous Stream Engine (Zero Downtime + Anti-Rewind Memory)
const server = http.createServer(async (req, res) => {
    if (req.url !== '/stream.ts') {
        res.writeHead(404); return res.end();
    }

    console.log("🎥 FFmpeg Connected! Injecting Raw Video Stream...");
    
    res.writeHead(200, {
        'Content-Type': 'video/MP2T',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache'
    });

    let keepStreaming = true;

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
            
            for (const line of lines) {
                if (line && !line.startsWith('#')) {
                    tsLinks.push(line.startsWith('http') ? line : new URL(line, playlistUrl).toString());
                }
            }

            // 🧠 THE FIX: Sirf NEW chunks nikalna (jo memory mein nahi hain)
            let newChunks = tsLinks.filter(url => !playedChunks.has(url));

            // Agar naye link par achanak 5-6 chunks ikhatte aa jayen, toh live edge par rehne ke liye sirf aakhri 2 uthao
            if (newChunks.length > 2) {
                newChunks = newChunks.slice(-2);
            }

            // Sirf naye chunks ko FFmpeg mein pipe karna
            for (let tsUrl of newChunks) {
                if (!keepStreaming) break;
                
                try {
                    const tsRes = await axios.get(tsUrl, {
                        responseType: 'arraybuffer', 
                        timeout: 3000, 
                        headers: { 'Referer': REFERER }
                    });
                    
                    res.write(Buffer.from(tsRes.data)); 
                    playedChunks.add(tsUrl); // 🧠 Clip ko memory mein save karo taake dobara play na ho
                    
                    // Server ki RAM bachane ke liye: Agar memory mein 100 se zyada clips ho jayen, toh sabse purani delete kar do
                    if (playedChunks.size > 100) {
                        const firstItem = playedChunks.values().next().value;
                        playedChunks.delete(firstItem);
                    }
                    
                } catch (e) {
                    console.log(`⚠️ Internet drop! Chunk missed. Skipping to keep LIVE edge...`);
                }
            }

            // 2 second wait karo taake streamer naya chunk upload kar le
            await new Promise(r => setTimeout(r, 2000));

        } catch (e) {
            await new Promise(r => setTimeout(r, 2000));
        }
    }
});

server.listen(8080, () => {
    console.log(`[🌐 PROXY] Continuous Stream Engine Ready at http://127.0.0.1:8080/stream.ts`);
});
