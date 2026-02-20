const express = require('express')
const { v4: uuidv4 } = require('uuid')
const Album = require('../models/Album.model')
const Image = require('../models/Image.model')
const router = express.Router()


const verifyJWT = (req, res, next) => {
    if(!req.user) {
        return res.status(401).json({ error: 'Unauthorized' })
    }
    next()
}

// CREATE ALBUM
router.post('/', verifyJWT, async (req, res) => {
    try {
        const { name, description } = req.body

        if (!name) {
            return res.status(400).json({ error: 'Album name is required' })
        }

        const album = new Album({
            albumId: uuidv4(),
            name,
            description: description || '',
            ownerId: req.user.userId,
            ownerEmail: req.user.email,
            sharedWith: []
        })

        await album.save()

        res.status(201).json({
            message: 'Album created successfully',
            album: {
                albumId: album.albumId,
                name: album.name,
                description: album.description,
                ownerId: album.ownerId,
                sharedWith: album.sharedWith
            }
        })
    } catch (error) {
        console.error('Error creating album:', error)
        res.status(500).json({ error: 'Failed to create album' })
    }
})

// GET ALL ALBUMS (owned + shared)
router.get('/', verifyJWT, async (req, res) => {
    try {
        const userEmail = req.user.email
        const userId = req.user.userId

        // Find albums where user is owner OR email is in sharedWith array
        const albums = await Album.find({
            $or: [
                { ownerId: userId },
                { sharedWith: userEmail }
            ]
        }).sort({ createdAt: -1 })

        res.json({
            albums: albums.map(album => ({
                albumId: album.albumId,
                name: album.name,
                description: album.description,
                ownerId: album.ownerId,
                ownerEmail: album.ownerEmail,
                sharedWith: album.sharedWith,
                createdAt: album.createdAt
            }))
        })
    } catch (error) {
        console.error('Error fetching albums:', error)
        res.status(500).json({ error: 'Failed to fetch albums' })
    }
})

// GET SINGLE ALBUM
router.get('/:albumId', verifyJWT, async (req, res) => {
    try {
        const { albumId } = req.params
        const album = await Album.findOne({ albumId })

        if (!album) {
            return res.status(404).json({ error: 'Album not found' })
        }

        // Check if user has access
        const hasAccess = album.ownerId === req.user.userId || 
                         album.sharedWith.includes(req.user.email)

        if (!hasAccess) {
            return res.status(403).json({ error: 'You do not have access to this album' })
        }

        res.json({ album })
    } catch (error) {
        console.error('Error fetching album:', error)
        res.status(500).json({ error: 'Failed to fetch album' })
    }
})

// UPDATE ALBUM DESCRIPTION
router.post('/:albumId', verifyJWT, async (req, res) => {
    try {
        const { albumId } = req.params
        const { description } = req.body

        const album = await Album.findOne({ albumId })

        if (!album) {
            return res.status(404).json({ error: 'Album not found' })
        }

        // Only owner can update
        if (album.ownerId !== req.user.userId) {
            return res.status(403).json({ error: 'Only the album owner can update it' })
        }

        album.description = description || album.description
        await album.save()

        res.json({
            message: 'Album updated successfully',
            album: {
                albumId: album.albumId,
                name: album.name,
                description: album.description
            }
        })
    } catch (error) {
        console.error('Error updating album:', error)
        res.status(500).json({ error: 'Failed to update album' })
    }
})

// SHARE ALBUM (Add users by email)
router.post('/:albumId/share', verifyJWT, async (req, res) => {
    try {
        const { albumId } = req.params
        const { emails } = req.body

        if (!emails || !Array.isArray(emails) || emails.length === 0) {
            return res.status(400).json({ error: 'Valid email array is required' })
        }

        const album = await Album.findOne({ albumId })

        if (!album) {
            return res.status(404).json({ error: 'Album not found' })
        }

        // Only owner can share
        if (album.ownerId !== req.user.userId) {
            return res.status(403).json({ error: 'Only the album owner can share it' })
        }

        // Validate emails (basic validation)
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        const validEmails = emails.filter(email => emailRegex.test(email))

        if (validEmails.length === 0) {
            return res.status(400).json({ error: 'No valid emails provided' })
        }

        // Add emails to sharedWith array (avoid duplicates)
        validEmails.forEach(email => {
            if (!album.sharedWith.includes(email) && email !== album.ownerEmail) {
                album.sharedWith.push(email)
            }
        })

        await album.save()

        res.json({
            message: 'Album shared successfully',
            sharedWith: album.sharedWith
        })
    } catch (error) {
        console.error('Error sharing album:', error)
        res.status(500).json({ error: 'Failed to share album' })
    }
})

// DELETE ALBUM
router.delete('/:albumId', verifyJWT, async (req, res) => {
    try {
        const { albumId } = req.params

        const album = await Album.findOne({ albumId })

        if (!album) {
            return res.status(404).json({ error: 'Album not found' })
        }

        // Only owner can delete
        if (album.ownerId !== req.user.userId) {
            return res.status(403).json({ error: 'Only the album owner can delete it' })
        }

        // Delete all images in the album
        await Image.deleteMany({ albumId })

        // Delete the album
        await Album.deleteOne({ albumId })

        res.json({ message: 'Album and all associated images deleted successfully' })
    } catch (error) {
        console.error('Error deleting album:', error)
        res.status(500).json({ error: 'Failed to delete album' })
    }
})

module.exports = router
