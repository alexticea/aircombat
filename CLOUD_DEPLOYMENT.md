# 🚀 Deploying AirCombat Leaderboard to the Cloud

To make your leaderboard accessible from anywhere online, follow these two simple steps:

## 1. Set Up MongoDB Atlas (Database)
1.  Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) and create a free account.
2.  Create a new **Cluster** (choose the "M0" free tier).
3.  Go to **Database Access** and create a user (e.g., `admin`) and a password.
4.  Go to **Network Access** and select **"Allow Access from Anywhere"** (add `0.0.0.0/0`).
5.  Click **Connect** -> **Connect your application** -> Copy the connection string.
    *   It looks like: `mongodb+srv://admin:<password>@cluster0.abc.mongodb.net/aircombat?retryWrites=true&w=majority`

## 2. Deploy to Render (Server)
1.  Push your code to **GitHub**.
2.  Go to [Render.com](https://render.com/) and sign in with GitHub.
3.  Click **New +** -> **Web Service**.
4.  Select your `planes` repository.
5.  Configure the settings:
    *   **Root Directory**: `server`
    *   **Build Command**: `npm install`
    *   **Start Command**: `node index.js`
6.  Go to the **Environment** tab and add your variables:
    *   `MONGO_URI`: (Paste your MongoDB Atlas string here)
    *   `PORT`: `10000` (Render's default)
7.  Click **Deploy**. Once it's live, copy your service URL (e.g., `https://aircombat-backend.onrender.com`).

## 3. Update the App
Once you have your Render URL, update the `API_URL` in `App.tsx`:

```typescript
// Replace with your actual Render URL
const API_URL = 'https://aircombat-backend.onrender.com';
```

---
*Note: Your local .env file is only for local development. For the cloud, always use the Render Environment dashboard.*
