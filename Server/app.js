import "dotenv/config";
import express from "express";
import connectDB from "./config/db.js";
import cookieParser from "cookie-parser";
import cors from "cors";
import passport from "./config/passport.js";// registers the GitHub strategy
import authRoutes from "./routes/authRoutes.js";
import activityRoutes from "./routes/activityRoutes.js";
import publicRoutes from "./routes/pulicRoutes.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { startAutoSync } from "./jobs/autoSync.js";
import cron from "node-cron";
import { getSitemap, getRobots } from "./controllers/sitemapController.js";
import { buildOgHtml } from "./controllers/buildOgHtml.js";

connectDB();
const app = express();

app.get("/sitemap.xml", getSitemap);
app.get("/robots.txt", getRobots);


app.use(express.json());
app.use(cookieParser());

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,  // allows cookies to be sent cross-origin
  })
);

app.use(passport.initialize());



//health check
app.get("/", (req, res) => res.json({ status: "DashX API running" }));

app.use("/auth", authRoutes);
app.use("/activity", activityRoutes);
app.use("/public", publicRoutes);

app.use(notFound);
app.use(errorHandler);

app.get("/ping", (req, res) => {
  res.send("Server is alive")
});

cron.schedule("*/5 * * * *", async () => {
  try {
    await fetch("https://api.aalsicoders.in/ping");
    console.log("self ping succesful");

  } catch (error) {
    console.log("ping failed", error.message);
  }
});


const port = process.env.PORT || 5000;
app.listen(port, () => { console.log(`Server running at port ${port}`); });
// start background auto-sync — runs every hour
// syncs users whose lastSynced > 24h ago
startAutoSync();