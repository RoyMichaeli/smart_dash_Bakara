#!/bin/bash

# QA Smart Dashboard - Smart Startup Script
# This script checks if the default port is available and finds an alternative if needed

# Default configuration
DEFAULT_PORT=3000
MAX_PORT_ATTEMPTS=10
FALLBACK_HOST="127.0.0.1"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 QA Smart Dashboard - Starting...${NC}\n"

# Function to check if a port is in use
check_port() {
    local port=$1
    # Use lsof to check if port is in use (works on macOS)
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        return 1  # Port is in use
    else
        return 0  # Port is available
    fi
}

# Function to find an available port
find_available_port() {
    local start_port=$1
    local max_attempts=$2
    
    for ((i=0; i<max_attempts; i++)); do
        local test_port=$((start_port + i))
        if check_port $test_port; then
            echo $test_port
            return 0
        fi
    done
    
    return 1  # No available port found
}

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Error: Node.js is not installed${NC}"
    echo -e "${YELLOW}Please install Node.js from https://nodejs.org/${NC}"
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    npm install
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Failed to install dependencies${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Dependencies installed successfully${NC}\n"
fi

# Check if default port is available
echo -e "${BLUE}🔍 Checking port availability...${NC}"

if check_port $DEFAULT_PORT; then
    SELECTED_PORT=$DEFAULT_PORT
    echo -e "${GREEN}✅ Port $DEFAULT_PORT is available${NC}"
else
    echo -e "${YELLOW}⚠️  Port $DEFAULT_PORT is already in use${NC}"
    echo -e "${BLUE}🔍 Searching for an alternative port...${NC}"
    
    SELECTED_PORT=$(find_available_port $((DEFAULT_PORT + 1)) $MAX_PORT_ATTEMPTS)
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Found available port: $SELECTED_PORT${NC}"
    else
        echo -e "${RED}❌ Could not find an available port${NC}"
        echo -e "${YELLOW}Ports checked: $DEFAULT_PORT - $((DEFAULT_PORT + MAX_PORT_ATTEMPTS))${NC}"
        exit 1
    fi
fi

# Display startup information
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🎯 Starting QA Smart Dashboard${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}📍 Host:${NC} http://localhost:$SELECTED_PORT"
echo -e "${YELLOW}📍 Alt:${NC}  http://$FALLBACK_HOST:$SELECTED_PORT"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

# Start the server with the selected port
PORT=$SELECTED_PORT node server.js
