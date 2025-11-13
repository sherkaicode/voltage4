// Authentication utilities

import { User, mockUsers } from "./mock-data";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "gridpulse-secret-key-change-in-production";

export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: Omit<User, "password">;
  error?: string;
}

export function authenticateUser(email: string, password: string): AuthResponse {
  const user = mockUsers.find(
    (u) => u.email === email && u.password === password
  );

  if (!user) {
    return {
      success: false,
      error: "Invalid email or password",
    };
  }

  const token = jwt.sign(
    { userId: user.id, userType: user.userType },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  const { password: _, ...userWithoutPassword } = user;

  return {
    success: true,
    token,
    user: userWithoutPassword,
  };
}

export function verifyToken(token: string): { userId: string; userType: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; userType: string };
    return decoded;
  } catch {
    return null;
  }
}

