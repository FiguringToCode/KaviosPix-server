const mongoose = require('mongoose')
require('dotenv').config()

const initializeDatabase = async () => {
    try {
        const connection = await mongoose.connect(process.env.MONGO_URI)
        if(connection){
            console.log('Connected to Database Successful')
        }
    } catch (error) {
        console.log('Database connection failed', error)
    }
} 

module.exports = { initializeDatabase }