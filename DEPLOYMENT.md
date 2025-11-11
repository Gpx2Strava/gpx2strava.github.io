# Deployment Instructions for gpx2strava.github.io

## Option 1: Create GitHub Organization (Recommended)

To get `gpx2strava.github.io` as your URL:

1. **Create a GitHub Organization:**
   - Go to https://github.com/organizations/new
   - Organization name: `gpx2strava`
   - Choose a plan (Free is fine)
   - Complete the setup

2. **Create Repository in Organization:**
   - In the new organization, create a repository
   - Repository name: `gpx2strava.github.io` (must be exact)
   - Make it public
   - Don't initialize with README

3. **Push Code:**
   ```bash
   git remote set-url origin https://github.com/gpx2strava/gpx2strava.github.io.git
   git push -u origin main
   ```

4. **Enable GitHub Pages:**
   - Go to Settings → Pages
   - Source: `main` branch, `/ (root)` folder
   - Your site will be live at: `https://gpx2strava.github.io`

## Option 2: Use Personal Account Repository

If you create `gpx2strava.github.io` under your personal account:

1. **Create Repository:**
   - Go to https://github.com/new
   - Repository name: `gpx2strava.github.io`
   - Make it public

2. **Push Code:**
   ```bash
   git remote set-url origin https://github.com/Harrybradrocco/gpx2strava.github.io.git
   git push -u origin main
   ```

3. **Note:** This will be available at `harrybradrocco.github.io/gpx2strava.github.io/` (not `gpx2strava.github.io`)

