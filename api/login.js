export default function handler(req, res) {
  const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
  const DISCORD_REDIRECT_URI = process.env.VITE_APP_URL 
    ? `${process.env.VITE_APP_URL}/api/callback` 
    : 'http://localhost:5173/api/callback';
  
  if (!DISCORD_CLIENT_ID) {
    return res.status(500).send('DISCORD_CLIENT_ID is missing in Vercel Environment Variables.');
  }
  
  const idToken = req.query.idToken;
  const session = req.query.session;
  let discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&response_type=code&scope=identify`;
  
  if (idToken || session) {
    const stateObj = {};
    if (idToken) stateObj.idToken = idToken;
    if (session) stateObj.session = session;
    discordAuthUrl += `&state=${encodeURIComponent(JSON.stringify(stateObj))}`;
  }
  
  res.redirect(discordAuthUrl);
}
