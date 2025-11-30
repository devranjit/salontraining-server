import multer from "multer";

const storage = multer.memoryStorage(); // Vercel SAFE

const uploadTemp = multer({ storage });

export default uploadTemp;
