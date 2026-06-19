# VR Hotspots Educational Edition

A comprehensive VR Hotspot Editor with built-in student submission system for educational environments.

## 🎓 Educational Features

### For Students:

- **Full VR Editor**: Create immersive 360° experiences with hotspots
- **Easy Submission**: One-click project submission to admin
- **Professional Export**: Generate standalone VR experiences

### For Admins:

- **Automatic Collection**: All student projects automatically organized
- **Real-time Dashboard**: View submissions as they come in
- **Easy Access**: Download and review projects instantly
- **Common Assets Library**: Upload shared images, audio, and 3D files to Backblaze B2 with stable URLs for students

## 🚀 Quick Start

### 1. Setup (One Time)

```bash
# Install dependencies (includes A-Frame for offline support)
npm install

# Start the server
npm start
```

### 2. Offline Support ✨

- **Complete Offline Operation**: Works without internet connection
- **Local A-Frame**: VR libraries installed locally (no CDN required)
- **Self-Contained**: All assets and dependencies included
- **Perfect for Classrooms**: No internet connectivity required after setup

### 3. Access Points

- **Students**: http://localhost:3000 or open `index.html` directly
- **Admin Dashboard**: http://localhost:3000/admin-dashboard.html
- **Common Assets (Admin)**: http://localhost:3000/admin-common-assets.html

### 4. Workflow

1. Students create VR projects using the editor
2. Students click "📤 Submit to Admin" when ready
3. Admin reviews submissions on the dashboard
4. Admin downloads projects for grading/hosting

## Common Assets (B2 + Render)

Admins can upload shared media to Backblaze B2 and give students stable copy-paste URLs.

### Setup

Add to your `.env`:

```bash
B2_KEY_ID=your_key_id
B2_APP_KEY=your_app_key
B2_BUCKET_NAME=your_bucket_name

# Admin authentication (required for dashboard + asset uploads)
ADMIN_PASSWORD=your_secure_password
ADMIN_SESSION_SECRET=random_long_secret_string

# Optional: public bucket for common assets (auto-created as {B2_BUCKET_NAME}-public)
# B2_PUBLIC_BUCKET_NAME=your-bucket-public
# B2_PUBLIC_BUCKET_ID=
```

Common assets are stored in a **separate public B2 bucket** when your Backblaze account supports it (auto-created as `{B2_BUCKET_NAME}-public`). CORS is applied automatically so browsers can load assets from VR projects and exported scenes.

If Backblaze blocks public buckets (e.g. no payment history on the account), the app falls back to **signed Backblaze download URLs** (7-day expiry, refreshed when you open the asset library). Student project ZIPs always stay in the private bucket.

Run `npm run setup-b2-cors` manually if you need to refresh CORS rules.

### Admin workflow

1. Open `/admin-common-assets.html` and sign in with `ADMIN_PASSWORD`
2. Upload files by category (images, audio, 3D, other)
3. Preview assets and click **Copy URL** to get a direct Backblaze link like:
   `https://f005.backblazeb2.com/file/hotspot-vr/common-assets/images/photo_1234567890.jpg`

These URLs work from exported VR projects, VR headsets, and local testing — not tied to localhost.

### Student workflow

1. In the VR editor, click **Browse Shared Assets** in the sidebar
2. Search/browse by category, then **Copy** or **Use URL** in hotspot fields

Assets live under `common-assets/{category}/` in the public B2 bucket. The `/common-assets/...` app route redirects to the direct B2 URL for backward compatibility.

## 📁 Project Structure

```
vr_hotspots/
├── index.html                    # Main VR editor interface
├── script.js                     # Complete editor functionality
├── style-editor.html            # Visual customization tool
├── simple-server.js             # Educational backend server
├── admin-dashboard.html         # Admin submission viewer
├── admin-common-assets.html     # Admin common assets library
├── admin-auth.js                # Admin session authentication
├── lib/common-assets.js         # Asset category validation helpers
├── routes/common-assets-routes.js # Common assets API + proxy
├── package.json                 # Node.js dependencies
├── student-projects/            # Submitted projects folder (auto-created)
├── hosted-projects/             # Hosted projects folder (auto-created)
├── RENDER_DEPLOY.md             # Production setup and deployment guide
├── render.yaml                  # Render blueprint configuration
└── audio/, images/              # Asset folders
```

## 🎯 Core Features

### VR Editor:

- **Scene Management**: Multiple 360° environments
- **Hotspot Types**: Text, Audio, Text+Audio, Navigation, Weblink Portal (external URL)
- **Style Customization**: Visual theme editor
- **Export System**: Standalone project generation

### Educational Backend:

- **Project Collection**: Automatic ZIP file organization
- **Submission Tracking**: Metadata logging with timestamps
- **Admin Interface**: Clean dashboard for review
- **File Management**: Organized storage with student info

## 🛠 Technical Details

### Frontend:

- **A-Frame VR**: WebXR-compatible VR framework (v1.7.1 - local installation)
- **A-Frame Extras**: Additional VR components (v7.6.0 - local installation)
- **Offline Ready**: No CDN dependencies, works without internet
- **Responsive Design**: Works on desktop, mobile, VR headsets
- **LocalStorage**: User preferences and temporary data
- **Export System**: Complete project bundling

### Backend:

- **Node.js/Express**: Lightweight web server
- **Multer**: File upload handling
- **JSON Logging**: Simple submission tracking
- **Static Serving**: Hosts the VR editor

## 📖 Documentation

- **[Quick Start](#-quick-start)**: Local installation and usage
- **[Deploy to Render](RENDER_DEPLOY.md)**: Production hosting, B2 configuration, and admin URLs
- **[License](LICENSE.md)**: MIT license text

## 🎮 Usage Examples

### Student Workflow:

1. Open http://localhost:3000
2. Create hotspots by selecting type and clicking on 360° image
3. Add scenes, audio, and customize styles
4. Click "📤 Submit to Admin"
5. Fill in name, student ID, and project name
6. Submit automatically uploads complete project

### Admin Workflow:

1. Open admin dashboard
2. View real-time list of submissions
3. Download individual projects as ZIP files
4. Extract and open `index.html` to experience student work
5. Grade or host projects as needed

## 🔧 Customization

### For Different Classes:

- Modify submission form fields in `script.js`
- Customize dashboard layout in `admin-dashboard.html`
- Add authentication or grading features
- Integrate with LMS systems

### For Production:

- Deploy with [Deploy to Render](RENDER_DEPLOY.md) (recommended)
- Set B2 and admin secrets in the host environment (never commit `.env`)

## 🆘 Troubleshooting

### Common Issues:

- **Port 3000 in use**: The server will automatically fall back to the next available port. Check the console to see which port was chosen.
- **Submissions not working**: Check server console for errors
- **Large files failing**: Increase multer file size limits
- **Dashboard not updating**: Refresh browser or check network

### Support:

1. Check [Quick Start](#-quick-start) and [Deploy to Render](RENDER_DEPLOY.md) for setup and troubleshooting
2. Monitor server console output for error messages
3. Verify all files are present and Node.js is installed
4. Test with small projects first before full deployment

## 🔮 Future Enhancements

### Phase 2 Features:

- **Auto-hosting**: Deploy student projects to live URLs
- **Authentication**: Student accounts and login system
- **Grading Interface**: Built-in rubrics and scoring
- **Analytics**: Usage tracking and engagement metrics

### Database Integration:

- Replace JSON logging with PostgreSQL/MongoDB
- Add user management and project versioning
- Enable collaboration and sharing features
- Store detailed submission analytics

## 🙏 Acknowledgements

Special thanks to Syracuse University graduate [Sagar Gada](https://github.com/sagargada73), who created the first version of this application as a graduate student assistant for Professor Dan Pacheco, and later as a part-time employee under the National Science Foundation grant for the Innovative Technology Experiences for Students and Teachers (ITEST) project ([Syracuse University NSF Grant](https://soe.syr.edu/professor-huangs-nsf-grant/)). Especailly Syracuse University School of Education Professor Silvie Huang (PI), and co-PIs Professor Sharon Dotger, of the School of Education; Professor Brice Nordquist of the College of Arts and Sciences; Professors Nicholas Bowman and Daniel Pacheco of the S.I. Newhouse School of Public Communications; and Professors Matthew Potteiger and Stewart Diemontof the SUNY College of Environmental Science and Forestry.

Thanks also to all participants in that project, especially other faculty, students, community volunteers, and especially the youth who used the early tools and provided feedback.

## 📜 License

MIT License

Copyright 2026 Dan Pacheco <https://danpacheco.com/>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

See [LICENSE.md](LICENSE.md) for the canonical license file.

---

**Ready to start?** Use [Quick Start](#-quick-start) for local setup, or follow the [Render Deploy Guide](RENDER_DEPLOY.md) for production deployment.
