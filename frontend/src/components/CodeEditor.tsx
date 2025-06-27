import React, { useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import styled from 'styled-components';
import { TrivilToken, setupTrivilLanguageSupport } from './TrivilLanguageSupport';

type Monaco = typeof monaco;

const EditorContainer = styled.div<{ $isDark: boolean }>`
  height: 100%;
  background-color: ${props => props.$isDark ? '#1e1e1e' : '#ffffff'};
  border: 1px solid ${props => props.$isDark ? '#3e3e42' : '#e0e0e0'};
  border-radius: 4px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const EditorHeader = styled.div<{ $isDark: boolean }>`
  background-color: ${props => props.$isDark ? '#2d2d30' : '#f8f8f8'};
  border-bottom: 1px solid ${props => props.$isDark ? '#3e3e42' : '#e0e0e0'};
  padding: 8px 12px;
  font-size: 12px;
  color: ${props => props.$isDark ? '#cccccc' : '#333333'};
  display: flex;
  align-items: center;
  gap: 8px;
`;

const FileIcon = styled.div<{ $isDark: boolean }>`
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background-color: ${props => props.$isDark ? '#007acc' : '#007acc'};
`;

const EditorWrapper = styled.div`
  flex: 1;
  overflow: hidden;
`;

interface CodeEditorProps {
  value: string;
  onChange: (value: string | undefined) => void;
  theme: 'dark' | 'light';
  syntaxTokens?: TrivilToken[];
  syntaxAnalysisEnabled?: boolean;
  onRequestSyntaxAnalysis?: (code: string) => Promise<TrivilToken[]>;
}


let languageSetupDone = false;

export const CodeEditor: React.FC<CodeEditorProps> = ({ 
  value, 
  onChange, 
  theme, 
  syntaxTokens, 
  syntaxAnalysisEnabled,
  onRequestSyntaxAnalysis 
}) => {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  const handleEditorWillMount = (monacoInstance: Monaco) => {
    console.log('🚀 EDITOR: Monaco will mount - setting up language first');
    monacoRef.current = monacoInstance;
    
    
    console.log('🚀 EDITOR: Setting up Trivil language support (always)');
    try {
      setupTrivilLanguageSupport(theme, onRequestSyntaxAnalysis);
      languageSetupDone = true;
      console.log('🚀 EDITOR: Language setup completed');
      
      
      const languages = monacoInstance.languages.getLanguages();
      console.log('🚀 EDITOR: Languages after setup:', languages.map(l => l.id));
      console.log('🚀 EDITOR: Is trivil registered?', languages.some(l => l.id === 'trivil'));
      
    } catch (error) {
      console.error('🚀 EDITOR: Language setup failed:', error);
    }
  };

  const handleEditorDidMount = (editor: monaco.editor.IStandaloneCodeEditor, monacoInstance: Monaco) => {
    editorRef.current = editor;
    console.log('🚀 EDITOR: Editor mounted successfully');

    
    editor.updateOptions({
      fontSize: 14,
      fontFamily: 'Monaco, Menlo, Ubuntu Mono, Consolas, source-code-pro, monospace',
      lineHeight: 22,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 4,
      insertSpaces: true,
      wordWrap: 'on',
      lineNumbers: 'on',
      lineNumbersMinChars: 3,
      lineDecorationsWidth: 5,
      renderLineHighlight: 'line',
      selectionHighlight: false,
      occurrencesHighlight: 'off',
      renderWhitespace: 'none',
      folding: true,
      foldingStrategy: 'indentation',
      showFoldingControls: 'mouseover',
      unfoldOnClickAfterEndOfLine: false,
      contextmenu: true,
      mouseWheelZoom: true,
      multiCursorModifier: 'ctrlCmd',
      accessibilitySupport: 'auto',
      glyphMargin: false,
      overviewRulerLanes: 2,
      'semanticHighlighting.enabled': true,
      quickSuggestions: true,
      suggest: {
        showKeywords: true,
        showSnippets: true
      },
      hover: {
        enabled: true,
        delay: 100,
        sticky: true,
        hidingDelay: 100
      }
    });

    
    const model = editor.getModel();
    if (model) {
      console.log('🚀 EDITOR: Setting model language to trivil');
      console.log('🚀 EDITOR: Current model language before change:', model.getLanguageId());
      try {
        monacoInstance.editor.setModelLanguage(model, 'trivil');
        console.log('🚀 EDITOR: Language set successfully');
        console.log('🚀 EDITOR: Current model language after change:', model.getLanguageId());
        
        
        if (model.getLanguageId() !== 'trivil') {
          console.warn('🚀 EDITOR: Language did not stick, forcing again...');
          setTimeout(() => {
            monacoInstance.editor.setModelLanguage(model, 'trivil');
            console.log('🚀 EDITOR: Forced language again, now:', model.getLanguageId());
          }, 50);
        }
        
      } catch (error) {
        console.error('🚀 EDITOR: Error setting language:', error);
      }
      
      
      if (onRequestSyntaxAnalysis) {
        console.log('🚀 EDITOR: Setting up gentle token refresh for hover/completion');
        const changeDisposable = model.onDidChangeContent(() => {
          
          if ((editor as any)._refreshTimeout) {
            clearTimeout((editor as any)._refreshTimeout);
          }
          
          
          (editor as any)._refreshTimeout = setTimeout(() => {
            console.log('🔄 EDITOR: Content changed, refreshing backend tokens only');
            
            
            onRequestSyntaxAnalysis(model.getValue()).then(tokens => {
              console.log('🔄 EDITOR: Got', tokens.length, 'fresh tokens from backend');
              (window as any).latestTrivilTokens = tokens;
            }).catch(error => {
              console.warn('🔄 EDITOR: Backend token refresh failed:', error);
            });
          }, 1000); 
        });
        
        
        (editor as any)._changeDisposable = changeDisposable;
      }
    }

    
    console.log('🚀 EDITOR: === EMERGENCY HOVER PROVIDER SETUP ===');
    try {
      
      import('./TrivilLanguageSupport').then(({ TrivilHoverProvider, TrivilCompletionProvider }) => {
        console.log('🚀 EDITOR: TrivilHoverProvider imported successfully');
        
        
        const hoverProvider = new TrivilHoverProvider();
        console.log('🚀 EDITOR: TrivilHoverProvider instance created');
        
        
        const hoverDisposable1 = monacoInstance.languages.registerHoverProvider('trivil', hoverProvider);
        const hoverDisposable2 = monacoInstance.languages.registerHoverProvider('plaintext', hoverProvider);
        const hoverDisposable3 = monacoInstance.languages.registerHoverProvider('javascript', hoverProvider);
        
        console.log('🚀 EDITOR: ✅ EMERGENCY hover provider registered for all languages');
        console.log('🚀 EDITOR: Hover provider disposables:', { hoverDisposable1, hoverDisposable2, hoverDisposable3 });
        
        
        console.log('🚀 EDITOR: === REGISTERING COMPLETION PROVIDER ===');
        const completionProvider = new TrivilCompletionProvider();
        console.log('🚀 EDITOR: TrivilCompletionProvider instance created');
        
        const completionDisposable1 = monacoInstance.languages.registerCompletionItemProvider('trivil', completionProvider);
        const completionDisposable2 = monacoInstance.languages.registerCompletionItemProvider('plaintext', completionProvider);
        const completionDisposable3 = monacoInstance.languages.registerCompletionItemProvider('javascript', completionProvider);
        
        console.log('🚀 EDITOR: ✅ COMPLETION provider registered for all languages');
        console.log('🚀 EDITOR: Completion provider disposables:', { completionDisposable1, completionDisposable2, completionDisposable3 });
        
        
        (window as any).emergencyHoverProvider = hoverProvider;
        (window as any).emergencyHoverDisposables = [hoverDisposable1, hoverDisposable2, hoverDisposable3];
        (window as any).emergencyCompletionProvider = completionProvider;
        (window as any).emergencyCompletionDisposables = [completionDisposable1, completionDisposable2, completionDisposable3];
        
        
        const testPosition = new monacoInstance.Position(5, 10);
        const testCancellation = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => {} }) };
        
        if (model) {
          try {
            const hoverResult = hoverProvider.provideHover(model, testPosition, testCancellation as any);
            console.log('🚀 EDITOR: ✅ EMERGENCY hover test result:', hoverResult);
          } catch (error) {
            console.error('🚀 EDITOR: ❌ EMERGENCY hover test failed:', error);
          }
          
          
          console.log('🚀 EDITOR: Testing completion provider...');
          try {
            const completionResult = completionProvider.provideCompletionItems(model, testPosition, { triggerKind: 1 } as any, testCancellation as any);
            console.log('🚀 EDITOR: ✅ COMPLETION provider test result:', completionResult);
            if (completionResult && typeof completionResult === 'object' && 'suggestions' in completionResult) {
              console.log('🚀 EDITOR: Completion suggestions count:', completionResult.suggestions?.length || 0);
            }
          } catch (error) {
            console.error('🚀 EDITOR: ❌ COMPLETION provider test failed:', error);
          }
        }
        
      }).catch((importError: unknown) => {
        console.error('🚀 EDITOR: ❌ Emergency hover import failed:', importError);
      });
      
    } catch (emergencyError) {
      console.error('🚀 EDITOR: ❌ Emergency hover setup failed:', emergencyError);
    }

    console.log('🚀 EDITOR: Setup complete');
  };

  useEffect(() => {
    
    if (monacoRef.current && editorRef.current) {
      
      const themeToUse = theme === 'dark' ? 'vs-dark' : 'vs';
      console.log('🎨 EDITOR: Changing theme to:', themeToUse);
      try {
        monacoRef.current.editor.setTheme(themeToUse);
        console.log('🎨 EDITOR: Theme changed successfully to', themeToUse);
      } catch (error) {
        console.error('🎨 EDITOR: Theme change failed:', error);
      }
    }
  }, [theme]);

  return (
    <EditorContainer $isDark={theme === 'dark'}>
      <EditorHeader $isDark={theme === 'dark'}>
        <FileIcon $isDark={theme === 'dark'} />
        main.tri
      </EditorHeader>
      <EditorWrapper>
        <Editor
          height="100%"
          defaultLanguage="trivil"
          language="trivil"
          value={value}
          onChange={onChange}
          beforeMount={handleEditorWillMount}
          onMount={handleEditorDidMount}
          theme={theme === 'dark' ? 'vs-dark' : 'vs'}
          options={{
            readOnly: false,
            selectOnLineNumbers: true,
            roundedSelection: false,
            cursorStyle: 'line',
            automaticLayout: true,
            lineNumbersMinChars: 3,
            lineDecorationsWidth: 5,
            glyphMargin: false,
            folding: true,
            overviewRulerLanes: 2,
            hideCursorInOverviewRuler: true,
            overviewRulerBorder: false,
            renderLineHighlight: 'line',
            'semanticHighlighting.enabled': true,
            quickSuggestions: true,
            suggest: {
              showKeywords: true,
              showSnippets: true
            },
            hover: {
              enabled: true,
              delay: 100,
              sticky: true,
              hidingDelay: 100
            }
          }}
        />
      </EditorWrapper>
    </EditorContainer>
  );
}; 