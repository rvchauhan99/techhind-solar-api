const multer = require('multer');

// Configure multer for memory storage (needed for DO Spaces upload)
const storage = multer.memoryStorage();

// File filter - accept all file types
const fileFilter = (req, file, cb) => {
  cb(null, true);
};

const uploadMemory = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: fileFilter
});

module.exports = uploadMemory;

