import React from 'react';
import styled from 'styled-components';
import { Terminal, Copy, Trash2 } from 'lucide-react';

const OutputContainer = styled.div<{ $isDark: boolean }>`
  height: 100%;
  width: 100%;
  background-color: ${props => props.$isDark ? '#1e1e1e' : '#ffffff'};
  display: flex;
  flex-direction: column;
`;

const OutputHeader = styled.div<{ $isDark: boolean }>`
  padding: 8px 16px;
  background-color: ${props => props.$isDark ? '#2d2d30' : '#f8f8f8'};
  border-bottom: 1px solid ${props => props.$isDark ? '#3e3e42' : '#e0e0e0'};
  font-size: 12px;
  font-weight: 500;
  color: ${props => props.$isDark ? '#cccccc' : '#333333'};
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const IconButton = styled.button<{ $isDark: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background-color: transparent;
  color: ${props => props.$isDark ? '#cccccc' : '#333333'};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background-color: ${props => props.$isDark ? '#3e3e42' : '#f0f0f0'};
  }
`;

const OutputContent = styled.div<{ $isDark: boolean }>`
  flex: 1;
  padding: 16px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'source-code-pro', monospace;
  font-size: 13px;
  line-height: 1.5;
  color: ${props => props.$isDark ? '#cccccc' : '#333333'};
  background-color: ${props => props.$isDark ? '#1e1e1e' : '#ffffff'};
  overflow: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
`;

const LoadingIndicator = styled.div<{ $isDark: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: ${props => props.$isDark ? '#969696' : '#666666'};
  font-style: italic;
`;

const LoadingDots = styled.span`
  &::after {
    content: '';
    animation: dots 1.5s steps(4, end) infinite;
  }
  
  @keyframes dots {
    0%, 20% {
      content: '';
    }
    40% {
      content: '.';
    }
    60% {
      content: '..';
    }
    80%, 100% {
      content: '...';
    }
  }
`;

const OutputFooter = styled.div<{ $isDark: boolean }>`
  padding: 8px 16px;
  background-color: ${props => props.$isDark ? '#2d2d30' : '#f8f8f8'};
  border-top: 1px solid ${props => props.$isDark ? '#3e3e42' : '#e0e0e0'};
  font-size: 11px;
  color: ${props => props.$isDark ? '#969696' : '#666666'};
  text-align: center;
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

interface OutputPanelProps {
  output: string;
  isLoading: boolean;
  theme: 'dark' | 'light';
  executionTime?: number | null;
  onClear?: () => void;
}

export const OutputPanel: React.FC<OutputPanelProps> = ({ output, isLoading, theme, executionTime, onClear }) => {
  const isDark = theme === 'dark';

  const handleCopyOutput = async () => {
    try {
      await navigator.clipboard.writeText(output);
      
      console.log('Output copied to clipboard');
    } catch (error) {
      console.error('Failed to copy output:', error);
    }
  };

  const handleClearOutput = () => {
    if (onClear) {
      onClear();
    }
  };

  return (
    <OutputContainer $isDark={isDark}>
      <OutputHeader $isDark={isDark}>
        <HeaderLeft>
          <Terminal size={14} />
          Output
        </HeaderLeft>
        <HeaderRight>
          <IconButton 
            $isDark={isDark} 
            onClick={handleCopyOutput}
            title="Copy to clipboard"
            disabled={isLoading || !output.trim()}
          >
            <Copy size={14} />
          </IconButton>
          <IconButton 
            $isDark={isDark} 
            onClick={handleClearOutput}
            title="Clear output"
            disabled={isLoading}
          >
            <Trash2 size={14} />
          </IconButton>
        </HeaderRight>
      </OutputHeader>
      
      {isLoading ? (
        <LoadingIndicator $isDark={isDark}>
          Compiling code
          <LoadingDots />
        </LoadingIndicator>
      ) : (
        <OutputContent $isDark={isDark}>
          {output}
        </OutputContent>
      )}
      
      <OutputFooter $isDark={isDark}>
        {executionTime !== null ? `Execution time: ${executionTime}ms` : ''}
      </OutputFooter>
    </OutputContainer>
  );
}; 