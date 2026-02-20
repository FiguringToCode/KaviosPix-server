const mongoose = require('mongoose')

const AlbumSchema = new mongoose.Schema({
    albumId: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    description: {
        type: String,
        default: ''
    },
    ownerId: {
        type: String,
        required: true
    },
    ownerEmail: {
        type: String,
        required: true
    },
    sharedWith: [{
        type: String
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
})


const Album = mongoose.model('Album', AlbumSchema)

module.exports = Album