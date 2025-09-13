#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
const envExamplePath = path.join(__dirname, '..', '.env.example');

console.log('\n🔍 Checking environment setup...\n');

if (!fs.existsSync(envPath)) {
  console.log('❌ .env file not found!');
  console.log('📋 To get started:');
  console.log('   1. Copy .env.example to .env');
  console.log('   2. Add your OpenAI API key to the .env file');
  console.log('   3. Get your API key from: https://platform.openai.com/api-keys\n');

  if (fs.existsSync(envExamplePath)) {
    console.log('💡 Run this command to create your .env file:');
    console.log('   cp .env.example .env\n');
  }

  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const hasApiKey = envContent.includes('OPENAI_API_KEY=') &&
                  !envContent.includes('OPENAI_API_KEY=your_openai_api_key_here') &&
                  !envContent.includes('OPENAI_API_KEY=');

if (!hasApiKey) {
  console.log('⚠️  OpenAI API key not configured in .env file!');
  console.log('📋 Please:');
  console.log('   1. Open .env file');
  console.log('   2. Set OPENAI_API_KEY=your_actual_api_key');
  console.log('   3. Get your API key from: https://platform.openai.com/api-keys\n');
  process.exit(1);
}

console.log('✅ Environment setup looks good!\n');