const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Script para instalar OpenCV4nodejs e dependências
 */
class OpenCVInstaller {
  constructor() {
    this.isWindows = process.platform === 'win32';
    this.packageJson = path.join(__dirname, '..', 'package.json');
  }

  /**
   * Executar comando com promise
   */
  execCommand(command) {
    return new Promise((resolve, reject) => {
      console.log(`🔧 Executando: ${command}`);
      
      exec(command, { cwd: path.join(__dirname, '..') }, (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ Erro: ${error.message}`);
          reject(error);
          return;
        }
        
        if (stderr) {
          console.warn(`⚠️ Warning: ${stderr}`);
        }
        
        console.log(`✅ Sucesso: ${stdout}`);
        resolve(stdout);
      });
    });
  }

  /**
   * Verificar se OpenCV já está instalado
   */
  async checkOpenCVInstalled() {
    try {
      const cv = require('opencv4nodejs');
      console.log(`✅ OpenCV já instalado - versão: ${cv.version}`);
      return true;
    } catch (error) {
      console.log('📦 OpenCV não encontrado, iniciando instalação...');
      return false;
    }
  }

  /**
   * Instalar dependências do sistema
   */
  async installSystemDependencies() {
    try {
      console.log('🔧 Instalando dependências do sistema...');
      
      if (this.isWindows) {
        console.log('🪟 Sistema Windows detectado');
        console.log('📋 Dependências necessárias:');
        console.log('  - Visual Studio Build Tools');
        console.log('  - Python 3.x');
        console.log('  - CMake');
        console.log('');
        console.log('💡 Para instalar automaticamente, execute:');
        console.log('  npm install --global windows-build-tools');
        console.log('');
      } else {
        // Linux/Mac
        console.log('🐧 Sistema Unix detectado');
        
        // Tentar instalar dependências automaticamente
        if (fs.existsSync('/usr/bin/apt-get')) {
          // Ubuntu/Debian
          await this.execCommand('sudo apt-get update');
          await this.execCommand('sudo apt-get install -y build-essential cmake pkg-config');
          await this.execCommand('sudo apt-get install -y libjpeg-dev libtiff5-dev libpng-dev');
          await this.execCommand('sudo apt-get install -y libavcodec-dev libavformat-dev libswscale-dev');
        } else if (fs.existsSync('/usr/bin/yum')) {
          // CentOS/RHEL
          await this.execCommand('sudo yum groupinstall -y "Development Tools"');
          await this.execCommand('sudo yum install -y cmake pkgconfig');
        } else if (fs.existsSync('/usr/local/bin/brew')) {
          // macOS
          await this.execCommand('brew install cmake pkg-config');
        }
      }
      
    } catch (error) {
      console.warn('⚠️ Erro ao instalar dependências do sistema:', error.message);
      console.log('💡 Você pode precisar instalar manualmente as dependências');
    }
  }

  /**
   * Instalar OpenCV4nodejs
   */
  async installOpenCV() {
    try {
      console.log('📦 Instalando opencv4nodejs...');
      
      // Configurar variáveis de ambiente para compilação
      process.env.OPENCV4NODEJS_DISABLE_AUTOBUILD = '0';
      process.env.OPENCV_BUILD_ROOT = path.join(__dirname, '..', 'opencv-build');
      
      // Instalar o pacote
      await this.execCommand('npm install opencv4nodejs --save');
      
      console.log('✅ OpenCV4nodejs instalado com sucesso!');
      
    } catch (error) {
      console.error('❌ Erro ao instalar OpenCV4nodejs:', error.message);
      
      // Tentar instalação alternativa
      console.log('🔄 Tentando instalação alternativa...');
      
      try {
        // Instalar versão específica que funciona melhor
        await this.execCommand('npm install opencv4nodejs@5.6.0 --save');
        console.log('✅ OpenCV4nodejs (v5.6.0) instalado com sucesso!');
      } catch (altError) {
        console.error('❌ Instalação alternativa também falhou:', altError.message);
        throw altError;
      }
    }
  }

  /**
   * Testar instalação
   */
  async testInstallation() {
    try {
      console.log('🧪 Testando instalação do OpenCV...');
      
      const cv = require('opencv4nodejs');
      
      console.log(`✅ OpenCV versão: ${cv.version}`);
      console.log(`📋 Módulos disponíveis: ${cv.modules.length}`);
      
      // Teste básico
      const mat = new cv.Mat(100, 100, cv.CV_8UC3, [255, 0, 0]);
      console.log(`🔧 Teste básico: Matriz ${mat.rows}x${mat.cols} criada`);
      
      console.log('🎉 OpenCV está funcionando corretamente!');
      return true;
      
    } catch (error) {
      console.error('❌ Erro no teste:', error.message);
      return false;
    }
  }

  /**
   * Atualizar package.json
   */
  async updatePackageJson() {
    try {
      if (fs.existsSync(this.packageJson)) {
        const pkg = JSON.parse(fs.readFileSync(this.packageJson, 'utf8'));
        
        // Adicionar opencv4nodejs se não estiver presente
        if (!pkg.dependencies) pkg.dependencies = {};
        if (!pkg.dependencies['opencv4nodejs']) {
          pkg.dependencies['opencv4nodejs'] = '^5.6.0';
          
          fs.writeFileSync(this.packageJson, JSON.stringify(pkg, null, 2));
          console.log('✅ package.json atualizado');
        }
      }
    } catch (error) {
      console.warn('⚠️ Erro ao atualizar package.json:', error.message);
    }
  }

  /**
   * Criar diretório de templates
   */
  async createTemplatesDirectory() {
    try {
      const templatesDir = path.join(__dirname, '..', 'templates');
      
      if (!fs.existsSync(templatesDir)) {
        fs.mkdirSync(templatesDir, { recursive: true });
        console.log('📁 Diretório de templates criado');
        
        // Criar arquivo README
        const readmeContent = `# Templates de Produtos

Este diretório contém templates de imagens para reconhecimento de produtos.

## Como usar:

1. Adicione imagens de produtos conhecidos neste diretório
2. Nomeie os arquivos com o nome do produto (ex: \`fone-bluetooth.jpg\`)
3. O sistema usará essas imagens como referência para reconhecimento

## Formatos suportados:
- JPG/JPEG
- PNG

## Dicas:
- Use imagens claras e bem iluminadas
- Prefira fundos neutros
- Mantenha proporção similar entre templates
`;
        
        fs.writeFileSync(path.join(templatesDir, 'README.md'), readmeContent);
        console.log('📄 README criado no diretório de templates');
      }
    } catch (error) {
      console.warn('⚠️ Erro ao criar diretório de templates:', error.message);
    }
  }

  /**
   * Executar instalação completa
   */
  async install() {
    try {
      console.log('🚀 Iniciando instalação do OpenCV...');
      console.log('');
      
      // Verificar se já está instalado
      const isInstalled = await this.checkOpenCVInstalled();
      if (isInstalled) {
        console.log('✅ OpenCV já está instalado e funcionando!');
        return true;
      }
      
      // Instalar dependências do sistema
      await this.installSystemDependencies();
      
      // Instalar OpenCV
      await this.installOpenCV();
      
      // Testar instalação
      const testResult = await this.testInstallation();
      
      if (testResult) {
        // Atualizar package.json
        await this.updatePackageJson();
        
        // Criar diretório de templates
        await this.createTemplatesDirectory();
        
        console.log('');
        console.log('🎉 Instalação do OpenCV concluída com sucesso!');
        console.log('');
        console.log('📋 Próximos passos:');
        console.log('  1. Adicione imagens de produtos no diretório ./templates/');
        console.log('  2. Reinicie o sistema para usar o reconhecimento OpenCV');
        console.log('  3. Teste enviando uma foto via WhatsApp');
        console.log('');
        
        return true;
      } else {
        throw new Error('Teste de instalação falhou');
      }
      
    } catch (error) {
      console.error('');
      console.error('❌ Falha na instalação do OpenCV:', error.message);
      console.error('');
      console.error('💡 Soluções possíveis:');
      console.error('  1. Instale as dependências do sistema manualmente');
      console.error('  2. Use o sistema sem OpenCV (fallback automático)');
      console.error('  3. Consulte a documentação: https://github.com/justadudewhohacks/opencv4nodejs');
      console.error('');
      
      return false;
    }
  }
}

// Executar instalação se chamado diretamente
if (require.main === module) {
  const installer = new OpenCVInstaller();
  installer.install().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('❌ Erro fatal:', error.message);
    process.exit(1);
  });
}

module.exports = OpenCVInstaller;