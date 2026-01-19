import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function build() {
  console.log('🔨 Building Astra Watcher...');
  
  try {
    // Use Bun to build standalone executable
    const command = `bun build --target=bun --outfile=dist/astra-watcher src/index.ts`;
    
    console.log('Running:', command);
    
    const { stdout, stderr } = await execAsync(command);
    
    if (stdout) {
      console.log(stdout);
    }
    
    if (stderr) {
      console.warn('Warnings:', stderr);
    }
    
    console.log('✅ Build completed!');
    
    // Check if file was created and get size
    try {
      const { stat } = await import('fs/promises');
      const { join } = await import('path');
      
      const stats = await stat(join(process.cwd(), 'dist', 'astra-watcher'));
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      
      console.log(`📊 Binary size: ${sizeMB} MB`);
      
    } catch (error) {
      console.warn('Could not determine file size');
    }
    
  } catch (error: any) {
    console.error('❌ Build failed:', error.message);
    
    if (error.message.includes('command not found')) {
      console.log('💡 Tip: Make sure Bun is installed: https://bun.sh');
    }
    
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.main) {
  build();
}