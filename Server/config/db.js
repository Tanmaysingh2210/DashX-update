import mongoose from "mongoose";
import User from "../models/User.js";

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDb connected successfully");
        await User.createCollection();
        console.log("User collection created successfully");
    } catch (err) {
        console.log("mongodb connection failed", err.message);
        process.exit(1);
    }
}

export default connectDB;