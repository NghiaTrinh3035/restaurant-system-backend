import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  const dataAddressPath = path.join(__dirname, '../../../Data-Address');
  
  // 1. Seed Provinces
  const provincesPath = path.join(dataAddressPath, 'provinces.json');
  if (fs.existsSync(provincesPath)) {
    console.log('Seeding Provinces...');
    const provincesData = JSON.parse(fs.readFileSync(provincesPath, 'utf8'));
    
    for (const p of provincesData) {
      let cap = p.cap;
      let name = p.ten;
      
      // Handle "Thành phố Trung ương" logic based on user request
      if (cap === 'Thành phố Trung ương') {
        if (p.ma === '01') {
          cap = 'Thủ đô';
          name = 'Thủ đô Hà Nội';
        } else {
          cap = 'Thành phố';
        }
      }

      await prisma.province.upsert({
        where: { code: p.ma },
        update: {
          name: name,
          level: cap,
        },
        create: {
          code: p.ma,
          name: name,
          level: cap,
        },
      });
    }
    console.log(`Seeded ${provincesData.length} provinces.`);
  } else {
    console.warn(`File not found: ${provincesPath}`);
  }

  // 2. Seed Wards
  const wardsDir = path.join(dataAddressPath, 'wards');
  if (fs.existsSync(wardsDir)) {
    console.log('Seeding Wards...');
    const files = fs.readdirSync(wardsDir);
    let totalWards = 0;
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(wardsDir, file);
        const wardsData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        for (const w of wardsData) {
          await prisma.ward.upsert({
            where: { code: w.ma },
            update: {
              name: w.ten,
              fullName: w.ten_day_du,
              level: w.cap,
              provinceCode: w.ma_tinh,
            },
            create: {
              code: w.ma,
              name: w.ten,
              fullName: w.ten_day_du,
              level: w.cap,
              provinceCode: w.ma_tinh,
            },
          });
        }
        totalWards += wardsData.length;
      }
    }
    console.log(`Seeded ${totalWards} wards from ${files.length} files.`);
  } else {
    console.warn(`Directory not found: ${wardsDir}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
