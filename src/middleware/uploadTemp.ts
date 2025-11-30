import multer from "multer";

const storage = multer.memoryStorage();
const uploadTemp = multer({ storage });

export default uploadTemp;
