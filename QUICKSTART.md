# Quick Start - Get the Globe Running

Follow these steps to see the globe in your browser:

## 1. Install Dependencies

```bash
npm install
```

## 2. Run Development Server

```bash
npm run dev
```

## 3. Open Browser

Visit [http://localhost:3000](http://localhost:3000)

You should see a dark, spinning 3D Earth globe!

---

## What You'll See

- **Dark Earth** - A greyscale planet with no UI elements
- **Auto-rotation** - The globe slowly spins
- **Interactive** - Drag to rotate, works on mobile too

## Current State

The app is running in **globe-only mode** because Supabase is not configured yet.

To enable the full experience with real-time presence and pings:

1. Create a free Supabase account at [supabase.com](https://supabase.com)
2. Follow the setup guide in [DEPLOYMENT.md](DEPLOYMENT.md)
3. Add your Supabase credentials to `.env.local`

## Troubleshooting

### "Module not found" errors
```bash
# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Globe not showing
- Check browser console for errors (F12)
- Make sure you're on http://localhost:3000
- Try a different browser (Chrome/Firefox recommended)

### Port 3000 already in use
```bash
# Use a different port
npm run dev -- -p 3001
```

---

**That's it!** You should now see the globe. The full real-time features require Supabase setup (see DEPLOYMENT.md).