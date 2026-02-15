# DD-Satellite-Coms

## Setup

### 1. Install Dependencies

**Client:**
```bash
cd client
npm install
```

**Server:**
```bash
cd server
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the `server` folder with your API key:
```
N2YO_API_KEY=your_api_key_here
```

### 3. Build the Client
```bash
cd client
npm run build
```

### 4. Start the Server
```bash
cd server
node server.js
```

The server will now be running on `http://localhost:3001`