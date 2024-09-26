import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import crypto from "crypto";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import otpGenerator from "otp-generator";
import Otp from "../models/Otp.js";

dotenv.config();

const EMAIL_ID = process.env.EMAIL_ID;
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD;
const EMAIL_APP_PASSWORD = process.env.EMAIL_APP_PASSWORD;

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: EMAIL_ID,
    pass: EMAIL_APP_PASSWORD,
  },
});

export const register = async (req, res) => {
  try {
    const { name, email, phone } = req.body;

    // Find the user by email
    let user = await User.findOne({ email });

    if (user) {
      // If the user exists, update the details
      user.name = name || user.name;
      user.phone = phone || user.phone;
    } else {
      // If the user doesn't exist, create a new user
      user = new User({
        name,
        email,
        phone,
      });
    }

    // Save the user (either updated or newly created)
    const savedUser = await user.save();

    res.status(201).json(savedUser);
  } catch (err) {
    res.status(500).json({ error: err.message, msg: "Error in registering" });
  }
};

export const register_repo = async (req, res) => {
  const { repoUrl, bugDescription, branchName, email } = req.body;
  try {
    const user = await User.findOne({ email });

    user.repoUrl = repoUrl;
    user.bugDescription = bugDescription;
    user.branchName = branchName;
    res.status(200).json({ msg: "Repo details saved" });
    await user.save();
  } catch (err) {
    res
      .status(500)
      .json({ error: err.message, msg: "Error in saving fix details" });
  }
};

export const generateOTP = async (req, res) => {
  req.app.locals.OTP = await otpGenerator.generate(6, {
    lowerCaseAlphabets: false,
    upperCaseAlphabets: false,
    specialChars: false,
  });
  res.status(201).send({ code: req.app.locals.OTP });
};

export const verifyOTP = async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp)
    return res.status(400).send({ error: "Missing email or OTP" });

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).send({ error: "User not found" });

    if (
      user.resetPasswordOtp !== otp ||
      user.resetPasswordExpires < Date.now()
    ) {
      return res.status(401).send({ error: "Invalid or expired OTP" });
    }

    res.status(200).send({ msg: "OTP verified successfully" });
  } catch (error) {
    console.error("Error in verifyOTP:", error);
    res.status(500).send({ error: "Internal server error" });
  }
};
export const verifyEmailOtp = async (req, res) => {
  const { email, otp } = req.body;

  try {
    // Find the OTP entry in the database
    const otpRecord = await Otp.findOne({ email, otp });

    if (!otpRecord) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    // If OTP is valid, delete the OTP entry
    await Otp.deleteOne({ email, otp });

    res.status(200).json({ msg: "OTP verified successfully" });
  } catch (error) {
    console.error("Error in verifyEmailOtp:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const emailVerification = async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  // if (user) {
  //   return res.status(404).send("Account with that email address exists.");
  // }
  try {
    // Check if the email already has an OTP
    const existingOtp = await Otp.findOne({ email });
    if (existingOtp) {
      await Otp.deleteOne({ email }); // Remove any existing OTPs for this email
    }

    // Generate a 6-digit OTP
    const otp = otpGenerator.generate(6, {
      lowerCaseAlphabets: false,
      upperCaseAlphabets: false,
      specialChars: false,
    });

    // Create a new OTP entry with a 5-minute expiration
    const newOtp = new Otp({
      email,
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes in milliseconds
    });

    await newOtp.save(); // Save the OTP in the database

    // Send OTP to the user's email
    const mailOptions = {
      to: email,
      from: process.env.EMAIL_ID,
      subject: "Email Verification OTP",
      html: `
       <div style="font-family: Arial, sans-serif; line-height: 1.6; background-color: #f4f7fb; padding: 25px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); max-width: 600px; margin: 0 auto;">
  <h2 style="color: #333; margin-bottom: 20px; border-bottom: 2px solid #43a047; padding-bottom: 10px; font-size: 24px;">Email Verification OTP</h2>
  <p style="color: #444; font-size: 16px;">Hello,</p>
  <p style="color: #444; font-size: 16px;">Please use the following OTP to verify your email address:</p>
  <h2 style="background: #e0f4e1; color: #388e3c; padding: 15px; border-radius: 8px; text-align: center; font-weight: bold; letter-spacing: 1.5px; font-size: 22px;">${otp}</h2>
  <p style="color: #444; font-size: 16px;">This OTP is valid for 5 minutes.</p>
  <p style="color: #444; font-size: 16px;">If you did not request this, please ignore this email.</p>
  <p style="color: #333; margin-top: 30px; font-size: 16px;">Best regards,<br><strong>FixmyBug Team</strong></p>
</div>



      `,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({ msg: "An OTP has been sent to your email." });
  } catch (error) {
    console.error("Error in emailVerification:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};