import React from 'react';
import styled from 'styled-components';
import { Play, Sun, Moon, Loader2 } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const HeaderContainer = styled.header<{ $isDark: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background-color: ${props => props.$isDark ? '#2d2d30' : '#f8f8f8'};
  border-bottom: 1px solid ${props => props.$isDark ? '#3e3e42' : '#e0e0e0'};
  min-height: 60px;
  color: ${props => props.$isDark ? '#cccccc' : '#333333'};
`;

const LeftSection = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const Title = styled.h1`
  font-size: 20px;
  font-weight: 600;
  margin: 0;
  color: inherit;
`;

const Subtitle = styled.span<{ $isDark: boolean }>`
  font-size: 14px;
  color: ${props => props.$isDark ? '#969696' : '#666666'};
  font-weight: 400;
`;

const RightSection = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const Button = styled.button<{ $isDark: boolean; $variant?: 'primary' | 'secondary' }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: inherit;

  ${props => props.$variant === 'primary' ? `
    background-color: #007acc;
    color: white;
    
    &:hover:not(:disabled) {
      background-color: #1f9cf0;
    }
    
    &:disabled {
      background-color: ${props.$isDark ? '#2d2d30' : '#f0f0f0'};
      color: ${props.$isDark ? '#969696' : '#999999'};
      cursor: not-allowed;
    }
  ` : `
    background-color: transparent;
    color: ${props.$isDark ? '#cccccc' : '#333333'};
    border: 1px solid ${props.$isDark ? '#3e3e42' : '#e0e0e0'};
    
    &:hover {
      background-color: ${props.$isDark ? '#3e3e42' : '#f0f0f0'};
    }
  `}
`;

const IconButton = styled.button<{ $isDark: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 6px;
  background-color: transparent;
  color: ${props => props.$isDark ? '#cccccc' : '#333333'};
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background-color: ${props => props.$isDark ? '#3e3e42' : '#f0f0f0'};
  }
`;

interface HeaderProps {
  onRunCode: () => void;
  isLoading: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onRunCode, isLoading }) => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme.mode === 'dark';

  return (
    <HeaderContainer $isDark={isDark}>
      <LeftSection>
        <Title>Trivil Playground</Title>
        <Subtitle $isDark={isDark}>Interactive Development Environment</Subtitle>
      </LeftSection>
      
      <RightSection>
        <Button
          $isDark={isDark}
          $variant="primary"
          onClick={onRunCode}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Play size={16} />
          )}
          {isLoading ? 'Compiling...' : 'Run'}
        </Button>
        
        <IconButton $isDark={isDark} onClick={toggleTheme} title="Toggle theme">
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </IconButton>
      </RightSection>
    </HeaderContainer>
  );
}; 