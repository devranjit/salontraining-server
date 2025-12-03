import { Request, Response } from "express";
import { Blog } from "../models/Blog";

// ===============================
// PUBLIC — Get All Blogs (Published)
// ===============================
export const getBlogs = async (req: Request, res: Response) => {
  try {
    const {
      search,
      category,
      tag,
      sort = "newest",
      page = 1,
      limit = 12,
      featured,
    } = req.query;

    // Build query - only show published/approved blogs
    const query: any = {
      status: { $in: ["approved", "published"] }
    };

    // Search filter
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { content: { $regex: search, $options: "i" } },
        { excerpt: { $regex: search, $options: "i" } },
        { tags: { $regex: search, $options: "i" } },
      ];
    }

    // Category filter
    if (category && category !== "all") {
      query.category = category;
    }

    // Tag filter
    if (tag) {
      query.tags = { $in: [tag] };
    }

    // Featured filter
    if (featured === "true") {
      query.featured = true;
    }

    // Sort options
    let sortOption: any = { createdAt: -1 }; // newest
    if (sort === "oldest") sortOption = { createdAt: 1 };
    if (sort === "popular") sortOption = { views: -1 };
    if (sort === "az") sortOption = { title: 1 };
    if (sort === "za") sortOption = { title: -1 };

    // Pagination
    const skip = (Number(page) - 1) * Number(limit);

    const [blogs, total] = await Promise.all([
      Blog.find(query)
        .populate("owner", "name email")
        .sort(sortOption)
        .skip(skip)
        .limit(Number(limit))
        .select("-adminNotes"),
      Blog.countDocuments(query),
    ]);

    return res.json({
      success: true,
      blogs,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// PUBLIC — Get Featured Blogs
// ===============================
export const getFeaturedBlogs = async (req: Request, res: Response) => {
  try {
    const { limit = 4 } = req.query;

    const blogs = await Blog.find({
      status: { $in: ["approved", "published"] },
      featured: true,
    })
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .select("-adminNotes -content");

    return res.json({ success: true, blogs });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// PUBLIC — Get Single Blog (by ID or slug)
// ===============================
export const getSingleBlog = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    let blog = null;

    // Check if id is a valid MongoDB ObjectId
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(id);

    if (isValidObjectId) {
      blog = await Blog.findById(id)
        .populate("owner", "name email");
    }

    if (!blog) {
      blog = await Blog.findOne({ slug: id })
        .populate("owner", "name email");
    }

    if (!blog) {
      return res.status(404).json({ success: false, message: "Blog not found" });
    }

    // Only show published/approved blogs publicly
    if (!["approved", "published"].includes(blog.status)) {
      return res.status(404).json({ success: false, message: "Blog not found" });
    }

    // Increment views
    blog.views += 1;
    await blog.save();

    // Remove admin notes from public view
    const blogObj = blog.toObject();
    delete blogObj.adminNotes;

    return res.json({ success: true, blog: blogObj });
  } catch (error: any) {
    if (error.name === 'CastError') {
      return res.status(404).json({ success: false, message: "Blog not found" });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// USER — Create Blog
// ===============================
export const createBlog = async (req: any, res: Response) => {
  try {
    const blog = await Blog.create({
      owner: req.user.id,
      ...req.body,
      status: "pending",
    });

    return res.json({ success: true, blog });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// USER — Get My Blogs
// ===============================
export const getMyBlogs = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id || req.user?.id;

    const blogs = await Blog.find({ owner: userId })
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      blogs
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err?.message || "Server error",
    });
  }
};

// ===============================
// USER — Update My Blog
// ===============================
export const updateMyBlog = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id || req.user?.id;
    
    const blog = await Blog.findOneAndUpdate(
      { _id: req.params.id, owner: userId },
      { ...req.body, status: "pending" }, // Reset to pending after edit
      { new: true }
    );

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Blog not found or unauthorized",
      });
    }

    return res.json({ success: true, blog });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message || "Server error",
    });
  }
};

// ===============================
// USER — Delete My Blog
// ===============================
export const deleteMyBlog = async (req: Request, res: Response) => {
  try {
    const userId = req.user?._id || req.user?.id;
    
    const blog = await Blog.findOneAndDelete({
      _id: req.params.id,
      owner: userId,
    });

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Blog not found or unauthorized",
      });
    }

    return res.json({ success: true, message: "Blog deleted" });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message || "Server error",
    });
  }
};

// ===============================
// ADMIN — Get All Blogs
// ===============================
export const adminGetAllBlogs = async (req: Request, res: Response) => {
  try {
    const { status, featured, search, page = 1, limit = 20 } = req.query;

    const query: any = {};

    if (status && status !== "all") {
      query.status = status;
    }

    if (featured === "true") {
      query.featured = true;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { excerpt: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [blogs, total] = await Promise.all([
      Blog.find(query)
        .populate("owner", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Blog.countDocuments(query),
    ]);

    return res.json({
      success: true,
      blogs,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message || "Server error",
    });
  }
};

// ===============================
// ADMIN — Get Blog by ID
// ===============================
export const adminGetBlogById = async (req: Request, res: Response) => {
  try {
    const blog = await Blog.findById(req.params.id)
      .populate("owner", "name email");

    if (!blog) {
      return res.status(404).json({ success: false, message: "Blog not found" });
    }

    return res.json({ success: true, blog });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Update Blog
// ===============================
export const adminUpdateBlog = async (req: Request, res: Response) => {
  try {
    const blog = await Blog.findByIdAndUpdate(
      req.params.id,
      { ...req.body },
      { new: true }
    );

    if (!blog) {
      return res.status(404).json({ success: false, message: "Blog not found" });
    }

    return res.json({ success: true, blog });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Delete Blog
// ===============================
export const adminDeleteBlog = async (req: Request, res: Response) => {
  try {
    const blog = await Blog.findByIdAndDelete(req.params.id);

    if (!blog) {
      return res.status(404).json({ success: false, message: "Blog not found" });
    }

    return res.json({ success: true, message: "Blog deleted" });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Approve Blog
// ===============================
export const approveBlog = async (req: Request, res: Response) => {
  try {
    const blog = await Blog.findByIdAndUpdate(
      req.params.id,
      { status: "approved" },
      { new: true }
    );

    if (!blog) {
      return res.status(404).json({ success: false, message: "Blog not found" });
    }

    return res.json({ success: true, message: "Blog approved", blog });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Publish Blog
// ===============================
export const publishBlog = async (req: Request, res: Response) => {
  try {
    const { publishDate } = req.body;

    const blog = await Blog.findByIdAndUpdate(
      req.params.id,
      { 
        status: "published",
        publishDate: publishDate || new Date(),
      },
      { new: true }
    );

    if (!blog) {
      return res.status(404).json({ success: false, message: "Blog not found" });
    }

    return res.json({ success: true, message: "Blog published", blog });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Reject Blog
// ===============================
export const rejectBlog = async (req: Request, res: Response) => {
  try {
    const { adminNotes } = req.body;

    const blog = await Blog.findByIdAndUpdate(
      req.params.id,
      { 
        status: "rejected",
        adminNotes: adminNotes || undefined,
      },
      { new: true }
    );

    if (!blog) {
      return res.status(404).json({ success: false, message: "Blog not found" });
    }

    return res.json({ success: true, message: "Blog rejected", blog });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Request Changes
// ===============================
export const requestBlogChanges = async (req: Request, res: Response) => {
  try {
    const { adminNotes } = req.body;

    if (!adminNotes) {
      return res.status(400).json({
        success: false,
        message: "Admin notes required when requesting changes",
      });
    }

    const blog = await Blog.findByIdAndUpdate(
      req.params.id,
      { 
        status: "changes_requested",
        adminNotes,
      },
      { new: true }
    );

    if (!blog) {
      return res.status(404).json({ success: false, message: "Blog not found" });
    }

    return res.json({ success: true, message: "Changes requested", blog });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Set to Pending
// ===============================
export const setPendingBlog = async (req: Request, res: Response) => {
  try {
    const blog = await Blog.findByIdAndUpdate(
      req.params.id,
      { status: "pending" },
      { new: true }
    );

    if (!blog) {
      return res.status(404).json({ success: false, message: "Blog not found" });
    }

    return res.json({ success: true, message: "Blog set to pending", blog });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Toggle Featured
// ===============================
export const toggleBlogFeatured = async (req: Request, res: Response) => {
  try {
    const blog = await Blog.findById(req.params.id);

    if (!blog) {
      return res.status(404).json({ success: false, message: "Blog not found" });
    }

    blog.featured = !blog.featured;
    await blog.save();

    return res.json({
      success: true,
      message: blog.featured ? "Blog marked as featured" : "Blog removed from featured",
      blog,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ===============================
// ADMIN — Get Pending Counts
// ===============================
export const getBlogPendingCounts = async (req: Request, res: Response) => {
  try {
    const blogs = await Blog.countDocuments({ status: "pending" });

    return res.json({
      success: true,
      counts: { blogs }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};







