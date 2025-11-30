import multer from "multer";

const uploadTemp = multer({ dest: "tmp/" });

export default uploadTemp;
