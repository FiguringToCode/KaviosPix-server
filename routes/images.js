const express = require('express')
const multer = require('multer')
const { v4: uuidv4 } = require('uuid')
const cloudinary = require('cloudinary').v2
const Album = require('../models/Album.model')
const Image = require('../models/Image.model')
const router = express.Router()

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
})

// Configure multer for memory storage (it will upload directly to Cloudinary)
const storage = multer.memoryStorage()

// File filter to allow only images
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/
    const mimetype = allowedTypes.test(file.mimetype)

    if (mimetype) {
        return cb(null, true)
    } else {
        cb(new Error('Only image files (jpg, jpeg, png, gif, webp) are allowed'))
    }
}

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter
})

// Middleware to verify JWT
const verifyJWT = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' })
    }
    next()
}

// Helper function to upload to Cloudinary
const uploadToCloudinary = (fileBuffer, folder) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: folder,
                resource_type: 'image'
            },
            (error, result) => {
                if(error) {
                    reject(error)
                } else {
                    resolve(result)
                }
            }
        )
        uploadStream.end(fileBuffer)
    })
}

// UPLOAD IMAGE
router.post('/:albumId/images', verifyJWT, upload.single('file'), async (req, res) => {
    try {
        const { albumId } = req.params
        const { tags, person, isFavorite } = req.body

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' })
        }

        // Check if album exists and user has access
        const album = await Album.findOne({ albumId })

        if (!album) {
            return res.status(404).json({ error: 'Album not found' })
        }

        // Check access (owner or shared user)
        const hasAccess = album.ownerId === req.user.userId || 
                         album.sharedWith.includes(req.user.email)

        if (!hasAccess) {
            return res.status(403).json({ error: 'You do not have access to this album' })
        }

        // Parse tags if provided
        let parsedTags = []
        if (tags) {
            try {
                parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags
            } catch {
                parsedTags = []
            }
        }

        // Upload to Cloudinary
        const cloudinaryFolder = `kaviospix/${albumId}`
        const uploadResult = await uploadToCloudinary(req.file.buffer, cloudinaryFolder)

        // Create image record
        const image = new Image({
            imageId: uuidv4(),
            albumId,
            name: req.file.originalname,
            filename: req.file.originalname,
            cloudinaryUrl: uploadResult.secure_url,
            cloudinaryPublicId: uploadResult.public_id,
            tags: parsedTags,
            person: person || '',
            isFavorite: isFavorite === 'true' || isFavorite === true,
            comments: [],
            size: uploadResult.bytes,
            uploadedBy: req.user.userId
        })

        await image.save()

        res.status(201).json({
            message: 'Image uploaded successfully',
            image: {
                imageId: image.imageId,
                name: image.name,
                cloudinaryUrl: image.cloudinaryUrl,
                tags: image.tags,
                person: image.person,
                isFavorite: image.isFavorite,
                size: image.size,
                uploadedAt: image.uploadedAt
            }
        })
    } catch (error) {
        console.error('Error uploading image:', error)
        res.status(500).json({ error: error.message || 'Failed to upload image' })
    }
})

// GET ALL IMAGES IN ALBUM
router.get('/:albumId/images', verifyJWT, async (req, res) => {
    try {
        const { albumId } = req.params
        const { tags } = req.query

        // Check if album exists and user has access
        const album = await Album.findOne({ albumId })

        if (!album) {
            return res.status(404).json({ error: 'Album not found' })
        }

        const hasAccess = album.ownerId === req.user.userId || 
                         album.sharedWith.includes(req.user.email)

        if (!hasAccess) {
            return res.status(403).json({ error: 'You do not have access to this album' })
        }

        // Build query
        let query = { albumId }

        // Filter by tags if provided
        if (tags) {
            const tagArray = tags.split(',').map(tag => tag.trim())
            query.tags = { $in: tagArray }
        }

        const images = await Image.find(query).sort({ uploadedAt: -1 })

        res.json({
            images: images.map(img => ({
                imageId: img.imageId,
                name: img.name,
                cloudinaryUrl: img.cloudinaryUrl,
                tags: img.tags,
                person: img.person,
                isFavorite: img.isFavorite,
                comments: img.comments,
                size: img.size,
                uploadedAt: img.uploadedAt
            }))
        })
    } catch (error) {
        console.error('Error fetching images:', error)
        res.status(500).json({ error: 'Failed to fetch images' })
    }
})

// GET FAVORITE IMAGES IN ALBUM
router.get('/:albumId/images/favorites', verifyJWT, async (req, res) => {
    try {
        const { albumId } = req.params

        const album = await Album.findOne({ albumId })

        if (!album) {
            return res.status(404).json({ error: 'Album not found' })
        }

        const hasAccess = album.ownerId === req.user.userId || 
                         album.sharedWith.includes(req.user.email)

        if (!hasAccess) {
            return res.status(403).json({ error: 'You do not have access to this album' })
        }

        const images = await Image.find({ albumId, isFavorite: true }).sort({ uploadedAt: -1 })

        res.json({
            images: images.map(img => ({
                imageId: img.imageId,
                name: img.name,
                cloudinaryUrl: img.cloudinaryUrl,
                tags: img.tags,
                person: img.person,
                isFavorite: img.isFavorite,
                comments: img.comments,
                size: img.size,
                uploadedAt: img.uploadedAt
            }))
        })
    } catch (error) {
        console.error('Error fetching favorite images:', error)
        res.status(500).json({ error: 'Failed to fetch favorite images' })
    }
})

// STAR/UNSTAR IMAGE (Toggle favorite)
router.put('/:albumId/images/:imageId/favorite', verifyJWT, async (req, res) => {
    try {
        const { albumId, imageId } = req.params
        const { isFavorite } = req.body

        const album = await Album.findOne({ albumId })

        if (!album) {
            return res.status(404).json({ error: 'Album not found' })
        }

        const hasAccess = album.ownerId === req.user.userId || 
                         album.sharedWith.includes(req.user.email)

        if (!hasAccess) {
            return res.status(403).json({ error: 'You do not have access to this album' })
        }

        const image = await Image.findOne({ imageId, albumId })

        if (!image) {
            return res.status(404).json({ error: 'Image not found' })
        }

        image.isFavorite = isFavorite !== undefined ? isFavorite : !image.isFavorite
        await image.save()

        res.json({
            message: 'Image favorite status updated',
            isFavorite: image.isFavorite
        })
    } catch (error) {
        console.error('Error updating favorite status:', error)
        res.status(500).json({ error: 'Failed to update favorite status' })
    }
})

// ADD COMMENT TO IMAGE
router.post('/:albumId/images/:imageId/comments', verifyJWT, async (req, res) => {
    try {
        const { albumId, imageId } = req.params
        const { comment } = req.body

        if (!comment || comment.trim() === '') {
            return res.status(400).json({ error: 'Comment cannot be empty' })
        }

        const album = await Album.findOne({ albumId })

        if (!album) {
            return res.status(404).json({ error: 'Album not found' })
        }

        const hasAccess = album.ownerId === req.user.userId || 
                         album.sharedWith.includes(req.user.email)

        if (!hasAccess) {
            return res.status(403).json({ error: 'You do not have access to this album' })
        }

        const image = await Image.findOne({ imageId, albumId })

        if (!image) {
            return res.status(404).json({ error: 'Image not found' })
        }

        image.comments.push({
            userId: req.user.userId,
            userEmail: req.user.email,
            comment: comment.trim(),
            createdAt: new Date()
        })

        await image.save()

        res.json({
            message: 'Comment added successfully',
            comments: image.comments
        })
    } catch (error) {
        console.error('Error adding comment:', error)
        res.status(500).json({ error: 'Failed to add comment' })
    }
})

// DELETE IMAGE
router.delete('/:albumId/images/:imageId', verifyJWT, async (req, res) => {
    try {
        const { albumId, imageId } = req.params

        const album = await Album.findOne({ albumId })

        if (!album) {
            return res.status(404).json({ error: 'Album not found' })
        }

        // Check if user is owner of album or uploaded the image
        const image = await Image.findOne({ imageId, albumId })

        if (!image) {
            return res.status(404).json({ error: 'Image not found' })
        }

        const canDelete = album.ownerId === req.user.userId || image.uploadedBy === req.user.userId

        if (!canDelete) {
            return res.status(403).json({ error: 'You do not have permission to delete this image' })
        }

        // Delete from Cloudinary
        try {
            await cloudinary.uploader.destroy(image.cloudinaryPublicId)
        } catch (cloudinaryError) {
            console.error('Error deleting from Cloudinary: ', cloudinaryError)
        }
        

        // Delete from database
        await Image.deleteOne({ imageId })

        res.json({ message: 'Image deleted successfully' })
    } catch (error) {
        console.error('Error deleting image:', error)
        res.status(500).json({ error: 'Failed to delete image' })
    }
})

// GET IMAGE URL (returns Cloudinary URL)
router.get('/:albumId/images/:imageId/url', verifyJWT, async (req, res) => {
    try {
        const { albumId, imageId } = req.params

        const album = await Album.findOne({ albumId })

        if (!album) {
            return res.status(404).json({ error: 'Album not found' })
        }

        const hasAccess = album.ownerId === req.user.userId || 
                         album.sharedWith.includes(req.user.email)

        if (!hasAccess) {
            return res.status(403).json({ error: 'You do not have access to this album' })
        }

        const image = await Image.findOne({ imageId, albumId })

        if (!image) {
            return res.status(404).json({ error: 'Image not found' })
        }

        res.json({
            cloudinaryUrl: image.cloudinaryUrl,
            imageId: image.imageId,
            name: image.name
        })
    } catch (error) {
        console.error('Error fetching image URL:', error)
        res.status(500).json({ error: 'Failed to fetch image URL' })
    }
})

module.exports = router