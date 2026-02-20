const mongoose = require('mongoose')

const UserSchema = new mongoose.Schema({
    email: {type: String, required: true},
    createdAt: {type: Date, default: Date.now()}
})

const KaviosUser = mongoose.model("KaviosUser", UserSchema)

module.exports = KaviosUser