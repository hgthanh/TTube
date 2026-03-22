import { registerRoutes } from "../server/routes";
import express from "express";
import { createServer } from "http";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const server = createServer(app);

// In Vercel, we only want to register the API routes.
// The static files are handled by the vercel.json rewrites.
(async () => {
  await registerRoutes(server, app);
})();

export default app;
