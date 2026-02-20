const mongoose = require('mongoose')

const ImageSchema = new mongoose.Schema({
    imageId: {
        type: String,
        required: true,
        unique: true
    },
    albumId: {
        type: String,
        required: true,
        ref: 'Album'
    },
    name: {
        type: String,
        required: true
    },
    filename: {
        type: String,
        required: true
    },
    cloudinaryUrl: {
        type: String,
        required: true
    },
    cloudinaryPublicId: {
        type: String,
        required: true
    },
    tags: [{
        type: String
    }],
    person: {
        type: String,
        default: ''
    },
    isFavorite: {
        type: Boolean,
        default: false
    },
    comments: [{
        userId: String,
        userEmail: String,
        comment: String,
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    size: {
        type: Number,
        required: true
    },
    uploadedAt: {
        type: Date,
        default: Date.now
    },
    uploadedBy: {
        type: String,
        required: true
    }
})


const Image = mongoose.model("Image", ImageSchema)

module.exports = Image