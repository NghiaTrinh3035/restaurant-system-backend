-- CreateEnum
CREATE TYPE "RestaurantBranchStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "RestaurantTableStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'MAINTENANCE');

-- CreateTable
CREATE TABLE "restaurant_branches" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "status" "RestaurantBranchStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "table_types" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "description" TEXT,

    CONSTRAINT "table_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_tables" (
    "id" UUID NOT NULL,
    "tableNumber" TEXT NOT NULL,
    "floor" INTEGER NOT NULL,
    "status" "RestaurantTableStatus" NOT NULL DEFAULT 'AVAILABLE',
    "note" TEXT,
    "branchId" UUID NOT NULL,
    "tableTypeId" UUID NOT NULL,

    CONSTRAINT "restaurant_tables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_tables_branchId_tableNumber_key" ON "restaurant_tables"("branchId", "tableNumber");

-- AddForeignKey
ALTER TABLE "restaurant_tables" ADD CONSTRAINT "restaurant_tables_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "restaurant_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_tables" ADD CONSTRAINT "restaurant_tables_tableTypeId_fkey" FOREIGN KEY ("tableTypeId") REFERENCES "table_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
