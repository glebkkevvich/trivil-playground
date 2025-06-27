import React, { useState, useCallback, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Header } from './Header';
import { CodeEditor } from './CodeEditor';
import { OutputPanel } from './OutputPanel';
import { useTheme } from '../contexts/ThemeContext';
import { syntaxAnalysisService } from '../services/syntaxAnalysisService';
import { TrivilToken, TrivilErrorDetector, TrivilError } from './TrivilLanguageSupport';
import * as monaco from 'monaco-editor';

const Container = styled.div`
  height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  background-color: ${props => props.theme.colors.background};
  color: ${props => props.theme.colors.text};
`;

const MainContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const PanelContainer = styled.div`
  flex: 1;
  display: flex;
  overflow: hidden;
`;

const ResizeHandle = styled(PanelResizeHandle)`
  width: 4px;
  background-color: ${props => props.theme.colors.border};
  transition: background-color 0.2s ease;
  
  &:hover {
    background-color: ${props => props.theme.colors.accent};
  }

  &:active {
    background-color: ${props => props.theme.colors.accent};
  }
`;



const defaultTrivilCode = `модуль привет;

импорт "стд::вывод";

фн сумма(икс:Цел64, игрек:Цел64) : Цел64 {
    вернуть икс + игрек;
}

вход {
    пусть к = сумма(4, 5);
    вывод.ф("Сумма = $;", к);
}`;

export const PlaygroundLayout: React.FC = () => {
  const { theme } = useTheme();
  const [code, setCode] = useState<string>(defaultTrivilCode);
  const [output, setOutput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [syntaxTokens, setSyntaxTokens] = useState<TrivilToken[]>([]);
  const [syntaxAnalysisEnabled, setSyntaxAnalysisEnabled] = useState<boolean>(true);
  const [debugInfo, setDebugInfo] = useState<string>('Initializing...');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [errors, setErrors] = useState<TrivilError[]>([]);
  const syntaxAnalysisTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const errorDetectorRef = useRef<TrivilErrorDetector>(new TrivilErrorDetector());

  const handleRunCode = async () => {
    setIsLoading(true);
    setOutput('Compiling...');
    
    try {
      
      const currentHost = window.location.hostname;
      let backendUrl: string;
      
      if (currentHost === 'trivilplayground.innopolis.university') {
        backendUrl = 'http://trivilplayground.innopolis.university:8080/api/compile';
      } else if (currentHost === '10.90.136.35') {
        backendUrl = 'http://10.90.136.35:8080/api/compile';
      } else {
        backendUrl = process.env.REACT_APP_BACKEND_URL 
          ? `${process.env.REACT_APP_BACKEND_URL}/api/compile`
          : 'http://localhost:8080/api/compile';
      }
      
      const response = await fetch(backendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceCode: code
        }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        setOutput(result.output);
        setExecutionTime(result.executionTimeMs);
      } else {
        setOutput(`Compilation failed:

${result.error || result.output || 'Unknown error occurred'}`);
        setExecutionTime(null);
      }
      
      setIsLoading(false);
    } catch (error) {
      setOutput(`Network error: Failed to connect to backend server.
      
        Please ensure the backend is running and accessible.
      
Error details: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setExecutionTime(null);
      setIsLoading(false);
    }
  };

  
  const analyzeSyntax = useCallback(async (sourceCode: string) => {
    console.log('🔄 analyzeSyntax called with:', sourceCode.length, 'characters');
    console.log('🔧 syntaxAnalysisEnabled:', syntaxAnalysisEnabled);
    console.log('🔧 isAnalyzing:', isAnalyzing);
    console.log('📝 Source code preview:', sourceCode.substring(0, 50) + '...');
    
    if (isAnalyzing) {
      console.log('⏭️ Skipping analysis: already analyzing');
      setDebugInfo('⏭️ Analysis in progress...');
      return;
    }
    
    setDebugInfo(`Analyzing ${sourceCode.length} chars...`);
    setIsAnalyzing(true);
    
    if (!syntaxAnalysisEnabled || !sourceCode.trim()) {
      console.log('⏭️ Skipping analysis: enabled=' + syntaxAnalysisEnabled + ', hasCode=' + !!sourceCode.trim());
      setSyntaxTokens([]);
      setDebugInfo('Analysis disabled or no code');
      setIsAnalyzing(false);
      return;
    }

    try {
      console.log('📡 Calling syntax analysis service...');
      setDebugInfo('📡 Requesting from backend...');
      
      const startTime = Date.now();
      const tokens = await syntaxAnalysisService.analyzeSyntax(sourceCode);
      const duration = Date.now() - startTime;
      
      console.log('🎯 Received tokens from service:', tokens.length, 'tokens in', duration, 'ms');
      console.log('🔍 Token details:', tokens.slice(0, 3), '...'); 
      
      
      console.log('🎯 Regular analysis complete, setting tokens:', tokens.length);
      setSyntaxTokens(tokens);
      setDebugInfo(`🎯 Analysis: ${tokens.length} tokens`);
      
      
      (window as any).latestTrivilTokens = tokens;
      console.log('🎯 Stored tokens for hover provider:', tokens.length);
      
      
      try {
        console.log('🔍 ERROR: Starting error detection...');
        const detectedErrors = await errorDetectorRef.current.detectErrors(tokens, sourceCode);
        setErrors(detectedErrors);
        console.log('🔍 ERROR: Found', detectedErrors.length, 'errors');
        
        
        applyErrorMarkers(detectedErrors);
      } catch (error) {
        console.error('🔍 ERROR: Error detection failed:', error);
        setErrors([]);
      }
      
      
      console.log('🎨 SINGLE: Applying immediate highlighting (ONLY system running)');
      applyImmediateHighlighting(tokens, sourceCode, theme.mode);
      
    } catch (error) {
      console.error('❌ Regular syntax analysis failed:', error);
      setDebugInfo(`❌ Analysis failed: ${error instanceof Error ? error.message : 'Unknown'}`);
    } finally {
      setIsAnalyzing(false);
    }
  }, [syntaxAnalysisEnabled]);

  
  const applyErrorMarkers = useCallback((detectedErrors: TrivilError[]) => {
    console.log('🔍 MARKERS: Applying', detectedErrors.length, 'error markers');
    
    if (detectedErrors.length === 0) {
      console.log('🔍 MARKERS: No errors to display, aggressively clearing existing markers');
      try {
        
        const monacoLib = (window as any).monaco;
        if (monacoLib) {
          const editors = monacoLib.editor.getEditors();
          console.log('🔍 MARKERS: Found', editors.length, 'editors for clearing');
          
          if (editors.length > 0) {
            const editor = editors[0];
            const model = editor.getModel();
            if (model) {
              console.log('🔍 MARKERS: Clearing markers on model', model.uri.toString());
              
              
              monacoLib.editor.setModelMarkers(model, 'trivil-errors', []);
              monacoLib.editor.setModelMarkers(model, 'trivil', []);
              monacoLib.editor.setModelMarkers(model, 'typescript', []);
              monacoLib.editor.setModelMarkers(model, 'Trivil', []);
              monacoLib.editor.setModelMarkers(model, '', []);
              
              
              const allMarkers = monacoLib.editor.getModelMarkers({ resource: model.uri });
              console.log('🔍 MARKERS: Found', allMarkers.length, 'markers to clear individually');
              
              
              const ownerIds: string[] = Array.from(new Set(allMarkers.map((m: any) => m.owner as string)));
              ownerIds.forEach((owner: string) => {
                console.log('🔍 MARKERS: Clearing markers for owner:', owner);
                monacoLib.editor.setModelMarkers(model, owner, []);
              });
              
              
              model.pushEditOperations([], [], () => null);
              
              
              editor.layout();
              editor.trigger('source', 'editor.action.marker.next', {});
              
              
              const currentTheme = theme.mode;
              
              
              setTimeout(() => {
                editor.trigger('source', 'editor.action.marker.nextInFiles', {});
                model.pushEditOperations([], [], () => null);
                
                              
                
                editor.layout();
                
                
                const finalMarkers = monacoLib.editor.getModelMarkers({ resource: model.uri });
                console.log('🔍 MARKERS: Final verification: remaining markers:', finalMarkers.length);
                if (finalMarkers.length > 0) {
                  console.warn('🔍 MARKERS: ⚠️ Some markers still remain:', finalMarkers);
                }
              }, 50); 
              
              console.log('🔍 MARKERS: ✅ Markers cleared and editor refreshed');
              
              
              const remainingMarkers = monacoLib.editor.getModelMarkers({ resource: model.uri });
              console.log('🔍 MARKERS: Remaining markers after clearing:', remainingMarkers.length);
            }
          }
        }
      } catch (e) {
        console.warn('🔍 MARKERS: Failed to clear markers:', e);
      }
      return;
    }
    
    
    const tryApplyMarkers = () => {
      try {
        
        const monacoLib = (window as any).monaco;
        if (!monacoLib) {
          console.warn('🔍 MARKERS: Monaco not available on window');
          return false;
        }
        
        const editors = monacoLib.editor.getEditors();
        console.log('🔍 MARKERS: Found', editors.length, 'Monaco editors');
        
        if (editors.length === 0) {
          console.warn('🔍 MARKERS: No Monaco editors available');
          return false;
        }
        
        const editor = editors[0];
        const model = editor.getModel();
        
        if (!model) {
          console.warn('🔍 MARKERS: No Monaco model available');
          return false;
        }
        
        console.log('🔍 MARKERS: Model URI:', model.uri.toString());
        console.log('🔍 MARKERS: Model language:', model.getLanguageId());
        
        
        const markers: monaco.editor.IMarkerData[] = detectedErrors.map((error, i) => {
          const marker = {
            severity: monacoLib.MarkerSeverity.Error,
            startLineNumber: error.line,
            startColumn: error.column,
            endLineNumber: error.endLine,
            endColumn: error.endColumn,
            message: error.message,
            code: error.code || 'trivil-error',
            source: 'Trivil'
          };
          
          console.log(`🔍 MARKER ${i + 1}: Line ${marker.startLineNumber}:${marker.startColumn}-${marker.endLineNumber}:${marker.endColumn} - ${marker.message}`);
          return marker;
        });
        
        
        console.log('🔍 MARKERS: Clearing all previous trivil-errors markers');
        monacoLib.editor.setModelMarkers(model, 'trivil-errors', []);
        
        
        model.pushEditOperations([], [], () => null);
        
        
        monacoLib.editor.setModelMarkers(model, 'trivil-errors', markers);
        
        console.log('🔍 MARKERS: ✅ Applied', markers.length, 'markers to model');
        
        
        const allMarkers = monacoLib.editor.getModelMarkers({ resource: model.uri });
        console.log('🔍 MARKERS: ✅ Verification: Model now has', allMarkers.length, 'total markers');
                 allMarkers.forEach((marker: any, i: number) => {
           console.log(`🔍 VERIFY ${i + 1}: Line ${marker.startLineNumber}:${marker.startColumn} - ${marker.message}`);
         });
        
        
        editor.layout();
        
        
        
        return true;
      } catch (error) {
        console.error('🔍 MARKERS: ❌ Error applying markers:', error);
        return false;
      }
    };
    
    
    if (!tryApplyMarkers()) {
      
      console.log('🔍 MARKERS: Immediate application failed, trying with delay...');
      setTimeout(() => {
        tryApplyMarkers();
      }, 200);
    }
  }, [syntaxTokens, code, theme.mode]); 

  
  const applyImmediateHighlighting = (tokens: TrivilToken[], sourceCode: string, currentTheme?: string) => {
    console.log('🎨 IMMEDIATE: Starting immediate highlighting for', tokens.length, 'tokens');
    
    
    const isDarkTheme = currentTheme === 'dark' || theme.mode === 'dark';
    console.log('🎨 THEME: Using', isDarkTheme ? 'DARK' : 'LIGHT', 'theme with high contrast colors');
    
    try {
      
      let editor: any = null;
      
      
      if ((window as any).monaco?.editor?.getEditors) {
        const editors = (window as any).monaco.editor.getEditors();
        console.log('🎨 IMMEDIATE: Found', editors.length, 'Monaco editors via window.monaco');
        if (editors.length > 0) {
          editor = editors[0];
        }
      }
      
      
      if (!editor && typeof (window as any).monaco !== 'undefined') {
        try {
          const editors = (window as any).monaco.editor.getEditors();
          console.log('🎨 IMMEDIATE: Found', editors.length, 'Monaco editors via global monaco');
          if (editors.length > 0) {
            editor = editors[0];
          }
        } catch (e) {
          console.warn('🎨 IMMEDIATE: Global monaco access failed:', e);
        }
      }
      
      
      if (!editor) {
        console.log('🎨 IMMEDIATE: Trying to find editor via DOM...');
        const monacoElements = document.querySelectorAll('.monaco-editor');
        console.log('🎨 IMMEDIATE: Found', monacoElements.length, 'Monaco editor elements in DOM');
        
        if (monacoElements.length > 0) {
          
          const monacoElement = monacoElements[0] as any;
          if (monacoElement && monacoElement._monacoEditor) {
            editor = monacoElement._monacoEditor;
            console.log('🎨 IMMEDIATE: Found editor via DOM element');
          }
        }
      }
      
      if (!editor) {
        console.error('🎨 IMMEDIATE: ❌ No Monaco editor found with any method');
        return;
      }
      
      const model = editor.getModel();
      if (!model) {
        console.warn('🎨 IMMEDIATE: ⚠️ No model found in editor');
        return;
      }
      
      console.log('🎨 IMMEDIATE: ✅ Editor and model found, applying decorations');
      
      
      if (editor._immediateDecorations && Array.isArray(editor._immediateDecorations)) {
        try {
          editor.deltaDecorations(editor._immediateDecorations, []);
        } catch (e) {
          console.warn('🎨 IMMEDIATE: Failed to clear previous decorations:', e);
        }
        editor._immediateDecorations = [];
      }
      
      
      const decorations: any[] = [];
      
      tokens.forEach((token, i) => {
        
        let color = isDarkTheme ? '#d4d4d4' : '#24292e'; 
        let fontWeight = 'normal';
        let fontStyle = 'normal';
        
        const tokenType = token.tokenType.toLowerCase();
        
        
        if (tokenType === 'keyword' || 
            tokenType === 'модуль' || tokenType === 'импорт' || 
            tokenType === 'фн' || tokenType === 'вход' || 
            tokenType === 'вернуть' || tokenType === 'пусть') {
          color = isDarkTheme ? '#569cd6' : '#0000ff'; 
          fontWeight = 'bold';
        } else if (tokenType === 'string_literal' || 
                   tokenType.includes('string') ||
                   (token.value.startsWith('"') && token.value.endsWith('"'))) {
          color = isDarkTheme ? '#ce9178' : '#008000'; 
        } else if (tokenType === 'number_literal' || 
                   tokenType.includes('number') ||
                   /^\d+$/.test(token.value)) {
          color = isDarkTheme ? '#b5cea8' : '#800080'; 
        } else if (tokenType.includes('function') || 
                   tokenType === 'function.user' ||
                   tokenType === 'function.imported' ||
                   tokenType === 'function.builtin') {
          color = isDarkTheme ? '#dcdcaa' : '#ff8000'; 
        } else if (tokenType.includes('type') || 
                   tokenType === 'type.builtin' ||
                   tokenType === 'type.user' ||
                   token.value === 'Цел64' || token.value === 'Стр') {
          color = isDarkTheme ? '#4ec9b0' : '#008080'; 
          fontWeight = 'bold';
        } else if (tokenType === 'identifier' || 
                   tokenType.includes('variable') ||
                   tokenType === 'variable.user' ||
                   tokenType === 'variable.parameter' ||
                   tokenType === 'variable.local') {
          color = isDarkTheme ? '#9cdcfe' : '#800040'; 
        } else if (tokenType === 'comment' || tokenType.includes('comment')) {
          color = isDarkTheme ? '#6a9955' : '#808080'; 
          fontStyle = 'italic';
        } else if (tokenType === 'operator' || 
                   ['+', '-', '*', '/', '=', ':', ';', '(', ')', '{', '}', '[', ']', ',', '.'].includes(token.value)) {
          color = isDarkTheme ? '#d4d4d4' : '#000000'; 
        } else if (tokenType === 'class.imported' || tokenType.includes('class')) {
          color = isDarkTheme ? '#4ec9b0' : '#008080'; 
        } else {
          
          color = isDarkTheme ? '#d4d4d4' : '#000000';
        }
        
        const Range = (window as any).monaco?.Range || ((editor as any).getModel().constructor as any).Range;
        
        const decoration = {
          range: new Range(
            token.startLine + 1,  
            token.startColumn + 1, 
            token.endLine + 1,
            token.endColumn + 1
          ),
          options: {
            inlineClassName: `immediate-highlight-${i}`,
            stickiness: 1, 
            isWholeLine: false
          }
        };
        
        decorations.push(decoration);
        
        console.log(`🎨 IMMEDIATE: Token ${i}: "${token.value}" (${token.tokenType}) → ${color} (${isDarkTheme ? 'dark' : 'light'})`);
      });
      
      
      const decorationIds = editor.deltaDecorations([], decorations);
      editor._immediateDecorations = decorationIds; 
      
      console.log('🎨 IMMEDIATE: ✅ Applied', decorationIds.length, 'immediate decorations');
      
      
      addImmediateHighlightingStyles(tokens, isDarkTheme);
      
    } catch (error) {
      console.error('🎨 IMMEDIATE: ❌ Error applying immediate highlighting:', error);
      console.error('🎨 IMMEDIATE: Error stack:', (error as Error)?.stack);
    }
  };

  
  const addImmediateHighlightingStyles = (tokens: TrivilToken[], isDarkTheme: boolean) => {
    const styleId = 'immediate-highlighting-styles';
    
    
    let style = document.getElementById(styleId) as HTMLStyleElement;
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }
    
    let css = '';
    
    tokens.forEach((token, i) => {
      let color = isDarkTheme ? '#d4d4d4' : '#333333';
      let fontWeight = 'normal';
      let fontStyle = 'normal';
      
      const tokenType = token.tokenType.toLowerCase();
      
      if (tokenType === 'keyword' || 
          tokenType === 'модуль' || tokenType === 'импорт' || 
          tokenType === 'фн' || tokenType === 'вход' || 
          tokenType === 'вернуть' || tokenType === 'пусть') {
        color = isDarkTheme ? '#569cd6' : '#0066cc'; 
        fontWeight = 'bold';
      } else if (tokenType === 'string_literal' || 
                 tokenType.includes('string') ||
                 (token.value.startsWith('"') && token.value.endsWith('"'))) {
        color = isDarkTheme ? '#ce9178' : '#d73a49'; 
      } else if (tokenType === 'number_literal' || 
                 tokenType.includes('number') ||
                 /^\d+$/.test(token.value)) {
        color = isDarkTheme ? '#b5cea8' : '#005cc5'; 
      } else if (tokenType.includes('function') || 
                 tokenType === 'function.user' ||
                 tokenType === 'function.imported' ||
                 tokenType === 'function.builtin') {
        color = isDarkTheme ? '#dcdcaa' : '#6f42c1'; 
      } else if (tokenType.includes('type') || 
                 tokenType === 'type.builtin' ||
                 tokenType === 'type.user' ||
                 token.value === 'Цел64' || token.value === 'Стр') {
        color = isDarkTheme ? '#4ec9b0' : '#005cc5'; 
        fontWeight = 'bold';
      } else if (tokenType === 'identifier' || 
                 tokenType.includes('variable') ||
                 tokenType === 'variable.user' ||
                 tokenType === 'variable.parameter' ||
                 tokenType === 'variable.local') {
        color = isDarkTheme ? '#9cdcfe' : '#24292e'; 
      } else if (tokenType === 'comment' || tokenType.includes('comment')) {
        color = isDarkTheme ? '#6a9955' : '#6a737d'; 
        fontStyle = 'italic';
      } else if (tokenType === 'operator' || 
                 ['+', '-', '*', '/', '=', ':', ';', '(', ')', '{', '}', '[', ']', ',', '.'].includes(token.value)) {
        color = isDarkTheme ? '#d4d4d4' : '#586069'; 
      } else if (tokenType === 'class.imported' || tokenType.includes('class')) {
        color = isDarkTheme ? '#4ec9b0' : '#005cc5'; 
      } else {
        
        color = isDarkTheme ? '#d4d4d4' : '#333333';
      }
      
      
      css += `.monaco-editor .view-lines .view-line .immediate-highlight-${i} {
        color: ${color} !important;
        font-weight: ${fontWeight} !important;
        font-style: ${fontStyle} !important;
        background: transparent !important;
        text-decoration: none !important;
        border: none !important;
        outline: none !important;
        transition: color 0.1s ease-in-out !important;
      }
      
      .monaco-editor .decorationsOverviewRuler .immediate-highlight-${i} {
        background: transparent !important;
      }
      
      `;
    });
    
    
    style.textContent = css;
    
    console.log('🎨 IMMEDIATE: ✅ Updated CSS styles for', tokens.length, 'tokens');
  };

  
  const requestSyntaxAnalysis = useCallback(async (sourceCode: string): Promise<TrivilToken[]> => {
    console.log('🔄 SEMANTIC: Requesting tokens for semantic provider and hover');
    
    try {
      
      const tokens = await syntaxAnalysisService.analyzeSyntax(sourceCode);
      console.log('🔄 SEMANTIC: Got tokens for semantic provider:', tokens.length);
      
      
      (window as any).latestTrivilTokens = tokens;
      console.log('🔄 SEMANTIC: Stored tokens for hover provider');
      
      return tokens;
    } catch (error) {
      console.error('🔄 SEMANTIC: Failed to get tokens:', error);
      return [];
    }
  }, []);

  const handleCodeChange = useCallback((value: string | undefined) => {
    const newCode = value || '';
    setCode(newCode);

    
    if (syntaxAnalysisTimeoutRef.current) {
      clearTimeout(syntaxAnalysisTimeoutRef.current);
    }

    
    syntaxAnalysisTimeoutRef.current = setTimeout(() => {
      console.log('🔄 REALTIME: Debounced analysis triggered after typing stopped');
      analyzeSyntax(newCode);
    }, 500); 
  }, [analyzeSyntax]);

  const handleClearOutput = () => {
    setOutput('');
    setExecutionTime(null);
  };

  const testDirectAPI = async () => {
    setDebugInfo('🧪 Testing direct API...');
    try {
      const response = await fetch('http://localhost:8080/api/syntax-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceCode: 'фн тест() {}', position: -1 })
      });
      const result = await response.json();
      setDebugInfo(`🧪 Direct test: ${result.tokens?.length || 0} tokens`);
    } catch (error) {
      setDebugInfo(`🧪 Direct test failed: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  };

  const testRealCode = async () => {
    setDebugInfo('🧪 Testing with real editor code...');
    console.log('🧪 Testing real code:', code);
    try {
      const response = await fetch('http://localhost:8080/api/syntax-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceCode: code, position: -1 })
      });
      console.log('🧪 Response status:', response.status);
      const responseText = await response.text();
      console.log('🧪 Raw response:', responseText);
      const result = JSON.parse(responseText);
      console.log('🧪 Parsed result:', result);
      setDebugInfo(`🧪 Real code test: ${result.tokens?.length || 0} tokens`);
    } catch (error) {
      console.error('🧪 Real code test error:', error);
      setDebugInfo(`🧪 Real test failed: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  };

  const forceAnalysis = async () => {
    console.log('🔥 Force Analysis clicked!');
    console.log('🔥 Current code:', code);
    console.log('🔥 Code length:', code.length);
    console.log('🔥 Code preview:', code.substring(0, 100));
    setDebugInfo('🔥 Force analyzing...');
    await analyzeSyntax(code);
  };

  const debugHoverTokens = () => {
    const tokens = (window as any).latestTrivilTokens as TrivilToken[] || [];
    console.log('🔍 DEBUG HOVER: Current tokens in window:', tokens.length);
    console.log('🔍 DEBUG HOVER: Tokens:', tokens);
    if (tokens.length === 0) {
      console.warn('🔍 DEBUG HOVER: No tokens available for hover!');
      setDebugInfo('❌ No hover tokens');
    } else {
      console.log('🔍 DEBUG HOVER: ✅ Tokens are available for hover');
      setDebugInfo(`✅ ${tokens.length} hover tokens`);
    }
  };

  const testHoverProvider = async () => {
    console.log('🧪 HOVER TEST: Testing hover provider manually...');
    
    
    const editors = (window as any).monaco?.editor?.getEditors() || [];
    if (editors.length === 0) {
      console.error('🧪 HOVER TEST: No Monaco editors found');
      setDebugInfo('❌ No editors found');
      return;
    }
    
    const editor = editors[0];
    const model = editor.getModel();
    if (!model) {
      console.error('🧪 HOVER TEST: No model found');
      setDebugInfo('❌ No model found');
      return;
    }
    
    console.log('🧪 HOVER TEST: Model language:', model.getLanguageId());
    
    
    const hoverProvider = (window as any).trivilHoverProvider;
    if (!hoverProvider) {
      console.error('🧪 HOVER TEST: No hover provider found in window');
      setDebugInfo('❌ No hover provider');
      return;
    }
    
    
    const position = { lineNumber: 10, column: 15 };
    console.log('🧪 HOVER TEST: Testing at position:', position);
    
    try {
      const result = await hoverProvider.provideHover(model, position, { isCancellationRequested: false });
      console.log('🧪 HOVER TEST: Manual hover result:', result);
      setDebugInfo(result ? `✅ Hover works: ${result.contents.length} items` : '❌ Hover returned null');
    } catch (error) {
      console.error('🧪 HOVER TEST: Manual hover failed:', error);
      setDebugInfo(`❌ Hover error: ${error}`);
         }
   };

  const forceLanguage = () => {
    const editors = (window as any).monaco?.editor?.getEditors() || [];
    if (editors.length === 0) {
      console.error('🔧 FORCE LANG: No Monaco editors found');
      setDebugInfo('❌ No editors');
      return;
    }
    
    const editor = editors[0];
    const model = editor.getModel();
    if (!model) {
      console.error('🔧 FORCE LANG: No model found');
      setDebugInfo('❌ No model');
      return;
    }
    
    console.log('🔧 FORCE LANG: Current language:', model.getLanguageId());
    (window as any).monaco.editor.setModelLanguage(model, 'trivil');
    console.log('🔧 FORCE LANG: Set language to trivil, now:', model.getLanguageId());
         setDebugInfo(`Language: ${model.getLanguageId()}`);
   };

  const testSimpleHover = () => {
    const editors = (window as any).monaco?.editor?.getEditors() || [];
    if (editors.length === 0) return;
    
    const editor = editors[0];
    const model = editor.getModel();
    if (!model) return;
    
    
    const testProvider = {
      provideHover: (model: any, position: any) => {
        console.log('🧪 SIMPLE HOVER: Called at', position);
        return {
          range: new (window as any).monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column + 5),
          contents: [{ value: "**Test Hover Works!**" }]
        };
      }
    };
    
    const disposable = (window as any).monaco.languages.registerHoverProvider('plaintext', testProvider);
    console.log('🧪 SIMPLE HOVER: Registered simple test provider');
    setDebugInfo('Simple hover registered');
    
    
    setTimeout(() => {
      disposable.dispose();
      console.log('🧪 SIMPLE HOVER: Disposed simple test provider');
         }, 10000);
   };

  const reregisterHover = () => {
    console.log('🔄 REREG: Re-registering hover provider...');
    
    
    const existingDisposables = (window as any).trivilHoverDisposables;
    if (existingDisposables) {
      existingDisposables.forEach((disposable: any) => {
        try {
          disposable.dispose();
        } catch (e) {
          console.warn('🔄 REREG: Error disposing provider:', e);
        }
      });
    }
    
    
    const hoverProvider = (window as any).trivilHoverProvider;
    if (!hoverProvider) {
      console.error('🔄 REREG: No hover provider found');
      setDebugInfo('❌ No hover provider');
      return;
    }
    
    
    const disposable1 = (window as any).monaco.languages.registerHoverProvider('trivil', hoverProvider);
    const disposable2 = (window as any).monaco.languages.registerHoverProvider('plaintext', hoverProvider);
    const disposable3 = (window as any).monaco.languages.registerHoverProvider('javascript', hoverProvider);
    
    (window as any).trivilHoverDisposables = [disposable1, disposable2, disposable3];
    
    console.log('🔄 REREG: ✅ Hover provider re-registered');
    setDebugInfo('Hover re-registered');
  };

  
  useEffect(() => {
    const initializeAnalysis = async () => {
      console.log('🏥 Initializing syntax analysis...');
      console.log('🏥 Current code:', code.substring(0, 50) + '...');
      
      setDebugInfo('🏥 Health check...');
      
      
      const isHealthy = await syntaxAnalysisService.healthCheck();
      console.log('🏥 Health check result:', isHealthy);
      setSyntaxAnalysisEnabled(isHealthy);
      
      if (!isHealthy) {
        console.warn('⚠️ Syntax analysis service is not available. Advanced highlighting will be disabled.');
        setDebugInfo('❌ Backend unavailable');
        return;
      }
      
      console.log('✅ Syntax analysis service is available');
      setDebugInfo('✅ Backend available');
      
      
      console.log('🚀 Forcing immediate initial syntax analysis...');
      console.log('🚀 Current code length:', code.length);
      console.log('🚀 Current code preview:', code.substring(0, 100));
      setDebugInfo('🚀 Initial analysis...');
      
      
      try {
        const tokens = await syntaxAnalysisService.analyzeSyntax(code);
        console.log('🎯 Initial analysis complete, setting tokens:', tokens.length);
        setSyntaxTokens(tokens);
        setDebugInfo(`🎯 Initial: ${tokens.length} tokens`);
        
        
        (window as any).latestTrivilTokens = tokens;
        console.log('🎯 Initial: Stored tokens for hover provider:', tokens.length);
        
        
        console.log('🎨 INITIAL: Applying immediate highlighting (single system)');
        applyImmediateHighlighting(tokens, code, theme.mode);
        
      } catch (error) {
        console.error('❌ Initial syntax analysis failed:', error);
        setDebugInfo(`❌ Initial failed: ${error instanceof Error ? error.message : 'Unknown'}`);
      }
    };

    
    const timer = setTimeout(initializeAnalysis, 100);
    return () => clearTimeout(timer);
  }, [code]);

  
  useEffect(() => {
    console.log('🎨 THEME CHANGE: Theme changed to', theme.mode, '- re-applying highlighting');
    
    
    if (syntaxTokens.length > 0 && syntaxAnalysisEnabled) {
      console.log('🎨 THEME CHANGE: Re-applying highlighting for', syntaxTokens.length, 'tokens with', theme.mode, 'theme');
      
      
      const themeChangeTimer = setTimeout(() => {
        applyImmediateHighlighting(syntaxTokens, code, theme.mode);
      }, 50); 
      
      return () => clearTimeout(themeChangeTimer);
    } else {
      console.log('🎨 THEME CHANGE: No tokens to re-highlight');
    }
  }, [theme.mode]); 

  
  useEffect(() => {
    return () => {
      if (syntaxAnalysisTimeoutRef.current) {
        clearTimeout(syntaxAnalysisTimeoutRef.current);
      }
    };
  }, []);

  return (
    <Container theme={theme}>
      <Header onRunCode={handleRunCode} isLoading={isLoading} />
      <MainContent>
        <PanelContainer>
          <PanelGroup direction="horizontal">
            <Panel defaultSize={62.5} minSize={30}>
              <CodeEditor 
                value={code} 
                onChange={handleCodeChange}
                theme={theme.mode}
                syntaxTokens={syntaxTokens}
                syntaxAnalysisEnabled={syntaxAnalysisEnabled}
                onRequestSyntaxAnalysis={requestSyntaxAnalysis}
              />
            </Panel>
            <ResizeHandle theme={theme} />
            <Panel defaultSize={37.5} minSize={20}>
              <OutputPanel 
                output={output} 
                isLoading={isLoading}
                theme={theme.mode}
                executionTime={executionTime}
                onClear={handleClearOutput}
              />
            </Panel>
          </PanelGroup>
        </PanelContainer>
      </MainContent>
    </Container>
  );
};