-- CreateEnum
CREATE TYPE "Role" AS ENUM ('MEMBER', 'MANAGER', 'OWNER');

-- AlterTable
ALTER TABLE "members" ADD COLUMN     "password_hash" TEXT,
ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'MEMBER';
