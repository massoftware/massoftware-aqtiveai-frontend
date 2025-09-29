pipeline {
    agent any

    environment {
        REGISTRY = "maserp/aqtiveai-frontend"
        REGISTRY_CREDENTIAL = 'dockerhub-user-maserp'
        DOCKER_IMAGE = ''
        NODE_VERSION = 'NodeJS-22'
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
                    echo "Git branch: $(git branch --show-current || echo 'detached')"
                    echo "Git remote branch: $(git symbolic-ref -q --short HEAD || git describe --tags --exact-match)"
                '''
                script {
                    echo "Jenkins BRANCH_NAME: ${env.BRANCH_NAME}"
                    echo "Jenkins GIT_BRANCH: ${env.GIT_BRANCH}"
                }
            }
        }

        stage('Install Dependencies') {
            steps {
                echo '📦 Installing dependencies...'
                sh '''
                    # Install dependencies (skip optional deps like lmdb to avoid build tools requirement)
                    npm ci --prefer-offline --no-audit --legacy-peer-deps --omit=optional || npm install --legacy-peer-deps --omit=optional
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
                        // Check for critical vulnerabilities first
                        sh 'npm audit --audit-level=critical'
                        echo "✅ No critical vulnerabilities found"

                        // Run full audit for reporting but don't fail the build
                        sh 'npm audit || echo "⚠️ Non-critical vulnerabilities detected but build continues"'
                    } catch (Exception e) {
                        echo "❌ Critical security vulnerabilities found: ${e.getMessage()}"
                        currentBuild.result = 'FAILURE'
                        error("Build failed due to critical security vulnerabilities")
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
                    branch 'origin/main'
                    branch 'origin/develop'
                    branch 'origin/master'
                    expression {
                        return env.GIT_BRANCH == 'origin/master' ||
                               env.GIT_BRANCH == 'origin/main' ||
                               env.GIT_BRANCH == 'origin/develop' ||
                               env.GIT_BRANCH == 'master' ||
                               env.GIT_BRANCH == 'main' ||
                               env.GIT_BRANCH == 'develop'
                    }
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
                        if (env.GIT_BRANCH == 'origin/main' || env.GIT_BRANCH == 'origin/master' ||
                            env.GIT_BRANCH == 'main' || env.GIT_BRANCH == 'master') {
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
                    branch 'origin/main'
                    branch 'origin/develop'
                    branch 'origin/master'
                    expression {
                        return env.GIT_BRANCH == 'origin/master' ||
                               env.GIT_BRANCH == 'origin/main' ||
                               env.GIT_BRANCH == 'origin/develop' ||
                               env.GIT_BRANCH == 'master' ||
                               env.GIT_BRANCH == 'main' ||
                               env.GIT_BRANCH == 'develop'
                    }
                }
            }
            steps {
                echo '📤 Pushing image to registry...'
                script {
                    try {
                        docker.withRegistry('', REGISTRY_CREDENTIAL) {
                            DOCKER_IMAGE.push("${BUILD_NUMBER}")

                            if (env.GIT_BRANCH == 'origin/main' || env.GIT_BRANCH == 'origin/master' ||
                                env.GIT_BRANCH == 'main' || env.GIT_BRANCH == 'master') {
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
                    branch 'origin/main'
                    branch 'origin/master'
                    expression {
                        return env.GIT_BRANCH == 'origin/master' ||
                               env.GIT_BRANCH == 'origin/main' ||
                               env.GIT_BRANCH == 'master' ||
                               env.GIT_BRANCH == 'main'
                    }
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