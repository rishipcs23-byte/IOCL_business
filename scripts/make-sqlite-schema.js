const fs = require('fs');
let content = fs.readFileSync('prisma/schema.prisma', 'utf8');
content = content.replace('provider = "postgresql"', 'provider = "sqlite"');
content = content.replace('url      = env("DATABASE_URL")', 'url      = "file:./dev.db"');
content = content.replace('provider = "prisma-client-js"', 'provider = "prisma-client-js"\n  output   = "../src/generated/sqlite-client"');
fs.writeFileSync('prisma/sqlite.schema.prisma', content);
console.log('Created prisma/sqlite.schema.prisma');
