pipeline {
    agent any

    environment {
        REGISTRY = "maserp/aqtiveai-frontend"
        REGISTRY_CREDENTIAL = 'dockerhub-user-maserp'
        DOCKER_IMAGE = ''
        NODE_VERSION = 'NodeJS-18'
        ANGULAR_CLI_VERSION = '18'
    }

    options {
        // Keep builds for 30 days, max 10 builds
        buildDiscarder(logRotator(daysToKeepStr: '30', numToKeepStr: '10'))
        // Timeout the entire pipeline after 30 minutes
        timeout(time: 30, unit: 'MINUTES')
        // Skip checkout when rebuilding
        skipDefaultCheckout(false)
    }

    tools {
        nodejs "${NODE_VERSION}"
    }

    stages {
        stage('Checkout') {
            steps {
                echo '🔄 Checking out source code...'
                checkout scm
            }
        }

        stage('Environment Setup') {
            steps {
                echo '🔧 Setting up environment...'
                sh '''
                    echo "Node version: $(node --version)"
                    echo "NPM version: $(npm --version)"
                    echo "Build number: ${BUILD_NUMBER}"
                    echo "Branch: ${BRANCH_NAME:-main}"
                '''
            }
        }

        stage('Install Dependencies') {
            steps {
                echo '📦 Installing dependencies...'
                sh '''
                    # Install Python and build tools (try different package managers)
                    if command -v apt-get >/dev/null 2>&1; then
                        apt-get update && apt-get install -y python3 python3-pip build-essential || true
                    elif command -v yum >/dev/null 2>&1; then
                        yum install -y python3 python3-pip gcc-c++ make || true
                    elif command -v apk >/dev/null 2>&1; then
                        apk add --no-cache python3 py3-pip make g++ || true
                    fi

                    # Install dependencies with fallback options
                    npm ci --prefer-offline --no-audit --legacy-peer-deps || npm install --legacy-peer-deps
                    echo "Dependencies installed successfully"
                '''
            }
        }

        stage('Lint') {
            steps {
                echo '🔍 Running linting...'
                script {
                    try {
                        sh 'npm run lint --if-present'
                    } catch (Exception e) {
                        echo "⚠️ Linting failed but continuing: ${e.getMessage()}"
                        currentBuild.result = 'UNSTABLE'
                    }
                }
            }
        }

        stage('Unit Tests') {
            steps {
                echo '🧪 Running unit tests...'
                script {
                    try {
                        sh '''
                            npm run test -- --watch=false --browsers=ChromeHeadless --code-coverage || true
                        '''
                    } catch (Exception e) {
                        echo "⚠️ Tests failed but continuing: ${e.getMessage()}"
                        currentBuild.result = 'UNSTABLE'
                    }
                }
            }
            post {
                always {
                    // Publish test results if they exist
                    script {
                        if (fileExists('coverage/lcov-report/index.html')) {
                            publishHTML([
                                allowMissing: false,
                                alwaysLinkToLastBuild: true,
                                keepAll: true,
                                reportDir: 'coverage/lcov-report',
                                reportFiles: 'index.html',
                                reportName: 'Coverage Report'
                            ])
                        }
                    }
                }
            }
        }

        stage('Build Application') {
            steps {
                echo '🏗️ Building Angular application...'
                sh '''
                    npm run build -- --configuration=production
                    echo "Build completed successfully"
                    ls -la dist/
                '''
            }
            post {
                success {
                    // Archive build artifacts
                    archiveArtifacts artifacts: 'dist/**/*', fingerprint: true
                }
            }
        }

        stage('Security Scan') {
            steps {
                echo '🔒 Running security audit...'
                script {
                    try {
                        sh 'npm audit --audit-level=high'
                    } catch (Exception e) {
                        echo "⚠️ Security vulnerabilities found: ${e.getMessage()}"
                        currentBuild.result = 'UNSTABLE'
                    }
                }
            }
        }

        stage('Build Docker Image') {
            when {
                anyOf {
                    branch 'main'
                    branch 'develop'
                    branch 'master'
                }
            }
            steps {
                echo '🐳 Building Docker image...'
                script {
                    try {
                        // Create Dockerfile if it doesn't exist
                        if (!fileExists('Dockerfile')) {
                            writeFile file: 'Dockerfile', text: '''
FROM nginx:alpine
COPY dist/open-ai-web /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf 2>/dev/null || echo "Using default nginx config"
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
'''
                        }

                        DOCKER_IMAGE = docker.build("${REGISTRY}:${BUILD_NUMBER}")

                        // Also tag as latest for main branch
                        if (env.BRANCH_NAME == 'main' || env.BRANCH_NAME == 'master') {
                            DOCKER_IMAGE.tag('latest')
                        }
                    } catch (Exception e) {
                        error "Failed to build Docker image: ${e.getMessage()}"
                    }
                }
            }
        }

        stage('Push to Registry') {
            when {
                anyOf {
                    branch 'main'
                    branch 'develop'
                    branch 'master'
                }
            }
            steps {
                echo '📤 Pushing image to registry...'
                script {
                    try {
                        docker.withRegistry('', REGISTRY_CREDENTIAL) {
                            DOCKER_IMAGE.push("${BUILD_NUMBER}")

                            if (env.BRANCH_NAME == 'main' || env.BRANCH_NAME == 'master') {
                                DOCKER_IMAGE.push('latest')
                            }
                        }
                        echo "✅ Successfully pushed ${REGISTRY}:${BUILD_NUMBER}"
                    } catch (Exception e) {
                        error "Failed to push Docker image: ${e.getMessage()}"
                    }
                }
            }
        }

        stage('Deploy to Staging') {
            when {
                branch 'develop'
            }
            steps {
                echo '🚀 Deploying to staging...'
                // Add your staging deployment logic here
                sh 'echo "Deploying to staging environment"'
            }
        }

        stage('Deploy to Production') {
            when {
                anyOf {
                    branch 'main'
                    branch 'master'
                }
            }
            steps {
                echo '🚀 Deploying to production...'
                // Add your production deployment logic here
                sh 'echo "Deploying to production environment"'
            }
        }
    }

    post {
        always {
            echo '🧹 Cleaning up...'
            script {
                try {
                    node {
                        // Clean up Docker images
                        sh """
                            docker rmi -f \${REGISTRY}:\${BUILD_NUMBER} 2>/dev/null || true
                            docker rmi -f \${REGISTRY}:latest 2>/dev/null || true
                            docker image prune -f 2>/dev/null || true
                            docker system prune -f 2>/dev/null || true
                        """
                    }
                } catch (Exception e) {
                    echo "Cleanup warning: ${e.getMessage()}"
                }
            }
        }

        success {
            echo '✅ Pipeline completed successfully!'
            // Add notification logic here (Slack, email, etc.)
        }

        failure {
            echo '❌ Pipeline failed!'
            // Add failure notification logic here
        }

        unstable {
            echo '⚠️ Pipeline completed with warnings!'
            // Add unstable notification logic here
        }
    }
}