# Stage 1: Build môi trường
FROM node:24-alpine AS builder

WORKDIR /usr/src/app

# Copy các file cấu hình package
COPY package*.json ./
COPY prisma ./prisma/

# Cài đặt tất cả dependencies (bao gồm cả devDependencies để build)
RUN npm ci

# Copy toàn bộ source code
COPY . .

# Khởi tạo Prisma Client
RUN npx prisma generate

# Build ứng dụng NestJS
RUN npm run build

# Stage 2: Môi trường Production thu gọn
FROM node:24-alpine AS production

WORKDIR /usr/src/app

# Copy các file cấu hình package
COPY package*.json ./
COPY prisma ./prisma/

# Chỉ cài đặt dependencies cần thiết cho production
RUN npm ci --omit=dev

# Khởi tạo Prisma Client cho production
RUN npx prisma generate

# Copy thư mục dist từ builder stage sang
COPY --from=builder /usr/src/app/dist ./dist

# Đặt biến môi trường mặc định là production
ENV NODE_ENV=production

# Render sẽ cung cấp biến môi trường PORT, nếu không có thì dùng 3000
EXPOSE 3000

# Lệnh khởi chạy
CMD [ "npm", "run", "start:prod" ]
