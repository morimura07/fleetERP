-- AlterEnum
-- Add FINANCE to the Role enum, positioned after DISPATCHER.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'FINANCE' AFTER 'DISPATCHER';
