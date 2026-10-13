export default function handler(_req, res) {
  res.status(200).json({
    ok: true,
    status: 'ready',
    mode: 'vercel-api'
  });
}
