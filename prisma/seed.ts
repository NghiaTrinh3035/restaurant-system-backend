import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

function findPath(candidates: string[]): string | null {
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function main() {
  const provincesCandidates = [
    path.join(__dirname, '../../provinces.json'),
    path.join(process.cwd(), '../provinces.json'),
    path.join(__dirname, '../../../Data-Address/provinces.json'),
    path.join(process.cwd(), 'provinces.json'),
  ];
  const provincesPath = findPath(provincesCandidates);

  // 1. Seed Provinces
  if (provincesPath) {
    console.log(`Seeding Provinces from ${provincesPath}...`);
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
    console.warn(`File not found in any candidate locations for provinces.json`);
  }

  // 2. Seed Wards
  const wardsCandidates = [
    path.join(__dirname, '../../wards'),
    path.join(process.cwd(), '../wards'),
    path.join(__dirname, '../../../Data-Address/wards'),
    path.join(process.cwd(), 'wards'),
  ];
  const wardsDir = findPath(wardsCandidates);

  if (wardsDir) {
    console.log(`Seeding Wards from ${wardsDir}...`);
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
    console.warn(`Directory not found in any candidate locations for wards`);
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
