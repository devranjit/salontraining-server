import app from "./server";
import { connectDB } from "./config/connectDB";

const PORT = process.env.PORT || 5000;

async function start() {
  await connectDB();
  app.listen(PORT, () => {
    console.log("Server running on port", PORT);
  });
}

start();
