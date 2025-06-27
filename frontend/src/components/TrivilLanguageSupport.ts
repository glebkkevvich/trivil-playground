import * as monaco from 'monaco-editor';

// Export the token interface 
export interface TrivilToken {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  tokenType: string;
  value: string;
  semanticInfo?: string;
}

// Define Monaco semantic token types (must match exactly)
export enum TrivilTokenType {
  KEYWORD = 'keyword',
  VARIABLE = 'variable',
  PARAMETER = 'parameter', 
  FUNCTION = 'function',
  TYPE = 'type',
  CLASS = 'class',
  STRING = 'string',
  NUMBER = 'number',
  COMMENT = 'comment',
  OPERATOR = 'operator',
  IDENTIFIER = 'variable' // Fallback to variable
}

// Basic tokenization for Trivil (as fallback)
const TRIVIL_MONARCH_LANGUAGE: monaco.languages.IMonarchLanguage = {
  defaultToken: '',
  tokenPostfix: '.trivil',

  keywords: [
    'модуль', 'импорт', 'вход', 'пусть', 'если', 'иначе', 'пока', 'для',
    'фн', 'функция', 'класс', 'тип', 'константа', 'переменная', 'возврат', 'вернуть', 'прервать',
    'продолжить', 'выбор', 'случай', 'умолчание', 'и', 'или', 'не', 'истина', 'ложь'
  ],

  builtinTypes: [
    'Цел64', 'Слово64', 'Вещ64', 'Лог', 'Строка', 'Символ', 'Байт', 'Пусто'
  ],

  builtinFunctions: [
    'вывод', 'ввод', 'длина', 'тег', 'нечто', 'добавить'
  ],

  operators: [
    '=', '>', '<', '!', '~', '?', ':', '==', '<=', '>=', '!=',
    '&&', '||', '++', '--', '+', '-', '*', '/', '&', '|', '^', '%',
    '<<', '>>', '>>>', '+=', '-=', '*=', '/=', '&=', '|=', '^=',
    '%=', '<<=', '>>=', '>>>='
  ],

  symbols: /[=><!~?:&|+\-*/%^]+/,

  tokenizer: {
    root: [
      // identifiers and keywords (fixed regex for Cyrillic)
      [/[а-яёА-ЯЁa-zA-Z_$][а-яёА-ЯЁa-zA-Z0-9_$]*/, {
        cases: {
          '@keywords': 'keyword',
          '@builtinTypes': 'type',
          '@builtinFunctions': 'function',
          '@default': 'identifier'
        }
      }],

      // whitespace
      { include: '@whitespace' },

      // delimiters and operators
      [/[{}()[\]]/, '@brackets'],
      [/[<>](?!@symbols)/, '@brackets'],
      [/@symbols/, {
        cases: {
          '@operators': 'operator',
          '@default': ''
        }
      }],

      // numbers
      [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
      [/0[xX][0-9a-fA-F]+/, 'number.hex'],
      [/\d+/, 'number'],

      // delimiter: after number because of .\d floats
      [/[;,.]/, 'delimiter'],

      // strings
      [/"([^"\\]|\\.)*$/, 'string.invalid'],  // non-terminated string
      [/"/, { token: 'string.quote', bracket: '@open', next: '@string' }]
    ],

    comment: [
      [/[^/*]+/, 'comment'],
      [/\/\*/, 'comment', '@push'],    // nested comment
      [/\*\//, 'comment', '@pop'],
      [/[/*]/, 'comment']
    ],

    string: [
      [/[^\\"]+/, 'string'],
      [/\\./, 'string.escape.invalid'],
      [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }]
    ],

    whitespace: [
      [/[ \t\r\n]+/, 'white'],
      [/\/\/.*$/, 'comment']
    ]
  }
};

// Semantic token provider for enhanced highlighting
export class TrivilSemanticTokenProvider implements monaco.languages.DocumentSemanticTokensProvider {
  private tokens: TrivilToken[] = [];
  private lastResultId: string = '';
  private lastCode: string = '';
  private lastUpdate: number = 0;
  private readonly DEBOUNCE_DELAY = 1000; // 1 second debounce
  
  constructor(
    private onTokensRequest: (code: string) => Promise<TrivilToken[]>
  ) {
    console.log('🎯 SEMANTIC: TrivilSemanticTokenProvider created with debouncing');
  }

  getLegend(): monaco.languages.SemanticTokensLegend {
    return {
      tokenTypes: [
        'keyword',
        'variable', 
        'parameter',
        'function',
        'type',
        'class',
        'string',
        'number',
        'comment',
        'operator'
      ],
      tokenModifiers: []
    };
  }

  async provideDocumentSemanticTokens(
    model: monaco.editor.ITextModel,
    lastResultId: string | null,
    token: monaco.CancellationToken
  ): Promise<monaco.languages.SemanticTokens | null> {
    try {
      console.log('🎯 SEMANTIC: ===== SEMANTIC TOKEN PROVIDER CALLED =====');
      console.log('🎯 SEMANTIC: lastResultId:', lastResultId);
      console.log('🎯 SEMANTIC: token cancelled:', token.isCancellationRequested);
      
      const code = model.getValue();
      const now = Date.now();
      
      // Debounce rapid updates to prevent blinking
      if (code === this.lastCode && (now - this.lastUpdate) < this.DEBOUNCE_DELAY) {
        console.log('🎯 SEMANTIC: 🚫 Debounced - code unchanged and too soon');
        if (this.lastResultId) {
          return {
            data: new Uint32Array(0),
            resultId: this.lastResultId
          };
        }
        return null;
      }
      
      console.log('🎯 SEMANTIC: Code length:', code.length);
      console.log('🎯 SEMANTIC: Code preview:', code.substring(0, 100));
      
      if (!this.onTokensRequest) {
        console.error('🎯 SEMANTIC: ❌ No token request callback!');
        return null;
      }
      
      console.log('🎯 SEMANTIC: 📡 Requesting tokens from backend...');
      // Get tokens from backend
      this.tokens = await this.onTokensRequest(code);
      this.lastCode = code;
      this.lastUpdate = now;
      console.log('🎯 SEMANTIC: ✅ Received', this.tokens.length, 'tokens from backend');
      
      // Log all received tokens
      console.group('🎯 SEMANTIC: All received tokens:');
      this.tokens.forEach((token, i) => {
        console.log(`Token ${i}: "${token.value}" (${token.tokenType}) at [${token.startLine}:${token.startColumn}-${token.endLine}:${token.endColumn}]`);
      });
      console.groupEnd();
      
      // Store for hover provider
      (window as any).latestTrivilTokens = this.tokens;
      console.log('🎯 SEMANTIC: Stored tokens for hover provider:', this.tokens.length, 'tokens');
      console.log('🎯 SEMANTIC: Sample tokens stored:', this.tokens.slice(0, 3));
      
      if (this.tokens.length === 0) {
        console.warn('🎯 SEMANTIC: ⚠️ No tokens received, returning null');
        return null;
      }
      
      console.log('🎯 SEMANTIC: 🔄 Starting token encoding for Monaco...');
      // Encode tokens for Monaco
      const data = this.encodeTokens(this.tokens);
      console.log('🎯 SEMANTIC: ✅ Encoded', data.length, 'values for Monaco');
      console.log('🎯 SEMANTIC: Sample encoded data:', Array.from(data.slice(0, 15)));
      
      if (data.length === 0) {
        console.error('🎯 SEMANTIC: ❌ Encoded data is empty!');
        return null;
      }
      
      this.lastResultId = Date.now().toString();
      const result = {
        data,
        resultId: this.lastResultId
      };
      
      console.log('🎯 SEMANTIC: 🎯 Returning semantic tokens result:', result.resultId);
      console.log('🎯 SEMANTIC: Data length:', result.data.length);
      console.log('🎯 SEMANTIC: Expected tokens count:', this.tokens.length);
      console.log('🎯 SEMANTIC: Expected data length (tokens * 5):', this.tokens.length * 5);
      
      // Skip manual decorations to prevent conflicts and blinking
      console.log('🎯 SEMANTIC: Manual decorations disabled to prevent blinking');
      
      return result;
      
    } catch (error) {
      console.error('🎯 SEMANTIC: ❌ Token analysis failed:', error);
      console.error('🎯 SEMANTIC: Error stack:', error instanceof Error ? error.stack : 'No stack');
      return null;
    }
  }

  releaseDocumentSemanticTokens(resultId: string | undefined): void {
    console.log('🎯 SEMANTIC: Released tokens for result:', resultId);
  }

  private encodeTokens(tokens: TrivilToken[]): Uint32Array {
    console.log('🔢 SEMANTIC: ===== ENCODING TOKENS FOR MONACO =====');
    console.log('🔢 SEMANTIC: Input tokens count:', tokens.length);
    
    const data: number[] = [];
    let prevLine = 0;
    let prevChar = 0;

    // Sort tokens by position
    tokens.sort((a, b) => {
      if (a.startLine !== b.startLine) return a.startLine - b.startLine;
      return a.startColumn - b.startColumn;
    });

    console.log('🔢 SEMANTIC: Tokens sorted by position');

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      
      const deltaLine = token.startLine - prevLine;
      const deltaChar = deltaLine === 0 ? token.startColumn - prevChar : token.startColumn;
      const length = token.endColumn - token.startColumn;
      const tokenTypeIndex = this.getTokenTypeIndex(token.tokenType);
      
      console.log(`🔢 SEMANTIC: Token ${i}: "${token.value}"`);
      console.log(`  - Backend type: "${token.tokenType}"`);
      console.log(`  - Position: [${token.startLine}:${token.startColumn}] to [${token.endLine}:${token.endColumn}]`);
      console.log(`  - Delta line: ${deltaLine}, Delta char: ${deltaChar}, Length: ${length}`);
      console.log(`  - Mapped type index: ${tokenTypeIndex} (${this.mapBackendTokenType(token.tokenType)})`);
      
      // Validate values
      if (deltaLine < 0 || deltaChar < 0 || length <= 0 || tokenTypeIndex < 0) {
        console.warn(`🔢 SEMANTIC: ⚠️ Skipping invalid token "${token.value}": deltaLine=${deltaLine}, deltaChar=${deltaChar}, length=${length}, typeIndex=${tokenTypeIndex}`);
        continue;
      }
      
      console.log(`  - ✅ Adding to encoded data: [${deltaLine}, ${deltaChar}, ${length}, ${tokenTypeIndex}, 0]`);
      data.push(deltaLine, deltaChar, length, tokenTypeIndex, 0);
      
      prevLine = token.startLine;
      prevChar = token.startColumn;
    }

    console.log('🔢 SEMANTIC: Final encoded data length:', data.length);
    console.log('🔢 SEMANTIC: Raw encoded data:', data);
    console.log('🔢 SEMANTIC: Encoded data (first 30 values):', data.slice(0, 30));
    
    const result = new Uint32Array(data);
    console.log('🔢 SEMANTIC: Uint32Array result length:', result.length);
    console.log('🔢 SEMANTIC: Uint32Array sample:', Array.from(result.slice(0, 15)));
    
    return result;
  }

  private getTokenTypeIndex(tokenType: string): number {
    const legend = this.getLegend();
    const mappedType = this.mapBackendTokenType(tokenType);
    const index = legend.tokenTypes.indexOf(mappedType);
    
    console.log(`🔍 SEMANTIC: getTokenTypeIndex for "${tokenType}"`);
    console.log(`  - Mapped to: "${mappedType}"`);
    console.log(`  - Legend types:`, legend.tokenTypes);
    console.log(`  - Found at index: ${index}`);
    
    if (index < 0) {
      console.error(`🔍 SEMANTIC: ❌ Token type "${mappedType}" not found in legend!`);
      console.error(`🔍 SEMANTIC: Available types:`, legend.tokenTypes);
      return 0; // Default to first type
    }
    
    return index;
  }
  
  private mapBackendTokenType(backendType: string): string {
    console.log(`🔍 SEMANTIC: Mapping backend token type: "${backendType}"`);
    
    const mapping: { [key: string]: string } = {
      // Lowercase keywords (backend sends these directly)
      'keyword': 'keyword',
      
      // Uppercase variants
      'KEYWORD': 'keyword',
      
      // Variables and identifiers
      'variable.user': 'variable',
      'USER_VARIABLE': 'variable',
      'variable.parameter': 'parameter',
      'FUNCTION_PARAMETER': 'parameter',
      'IDENTIFIER': 'variable',  // Backend sends this
      'identifier': 'variable',
      
      // Functions
      'function.user': 'function',
      'USER_FUNCTION': 'function',
      'function.imported': 'function',
      'IMPORTED_FUNCTION': 'function',
      'builtin.function': 'function',
      'BUILT_IN_FUNCTION': 'function',
      'function': 'function',
      
      // Types and classes
      'type.builtin': 'type',
      'BUILT_IN_TYPE': 'type',
      'class.imported': 'class',
      'IMPORTED_CLASS': 'class',
      'type': 'type',
      'class': 'class',
      
      // Literals
      'STRING_LITERAL': 'string',
      'string': 'string',
      'NUMBER_LITERAL': 'number',
      'number': 'number',
      
      // Comments
      'COMMENT': 'comment',
      'comment': 'comment',
      
      // Operators (backend sends this)
      'OPERATOR': 'operator',
      'operator': 'operator',
      
      // Delimiters
      'DELIMITER': 'operator',
      'delimiter': 'operator'
    };
    
    const mapped = mapping[backendType] || 'variable';
    console.log(`🔍 SEMANTIC: "${backendType}" → "${mapped}"`);
    
    if (!mapping[backendType]) {
      console.warn(`🔍 SEMANTIC: ⚠️ Unknown token type "${backendType}", defaulting to "variable"`);
    }
    
    return mapped;
  }

  private applyManualDecorations(model: monaco.editor.ITextModel): void {
    try {
      console.log('🎨 MANUAL: Applying manual decorations for', this.tokens.length, 'tokens');
      
      // Get all Monaco editors that use this model
      const editors = monaco.editor.getEditors();
      const targetEditor = editors.find(editor => editor.getModel() === model);
      
      if (!targetEditor) {
        console.warn('🎨 MANUAL: No editor found for model');
        return;
      }
      
      console.log('🎨 MANUAL: Found target editor, applying decorations');
      
      // Create decorations for each token
      const decorations: monaco.editor.IModelDeltaDecoration[] = [];
      
      this.tokens.forEach((token, i) => {
        const mappedType = this.mapBackendTokenType(token.tokenType);
        
        // Define color based on token type
        let color = '#d4d4d4'; // default
        let fontWeight = 'normal';
        
        switch (mappedType) {
          case 'keyword':
            color = '#569cd6';
            fontWeight = 'bold';
            break;
          case 'string':
            color = '#ce9178';
            break;
          case 'number':
            color = '#b5cea8';
            break;
          case 'comment':
            color = '#6a9955';
            break;
          case 'function':
            color = '#dcdcaa';
            break;
          case 'variable':
            color = '#9cdcfe';
            break;
          case 'type':
            color = '#4ec9b0';
            break;
          case 'operator':
            color = '#d4d4d4';
            break;
        }
        
        const decoration: monaco.editor.IModelDeltaDecoration = {
          range: new monaco.Range(
            token.startLine + 1,  // Monaco lines are 1-indexed
            token.startColumn + 1, // Monaco columns are 1-indexed
            token.endLine + 1,
            token.endColumn + 1
          ),
          options: {
            inlineClassName: `manual-token-${mappedType}`,
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
          }
        };
        
        decorations.push(decoration);
        
        console.log(`🎨 MANUAL: Token ${i}: "${token.value}" (${mappedType}) → ${color}`);
      });
      
      // Apply decorations
      const decorationIds = targetEditor.deltaDecorations([], decorations);
      console.log('🎨 MANUAL: Applied', decorationIds.length, 'manual decorations');
      
      // Add CSS styles for the decorations
      this.addManualTokenStyles();
      
    } catch (error) {
      console.error('🎨 MANUAL: Error applying manual decorations:', error);
    }
  }
  
  private addManualTokenStyles(): void {
    // Check if styles already added
    if (document.getElementById('trivil-manual-tokens')) return;
    
    const style = document.createElement('style');
    style.id = 'trivil-manual-tokens';
    style.textContent = `
      .manual-token-keyword { color: #569cd6 !important; font-weight: bold !important; }
      .manual-token-string { color: #ce9178 !important; }
      .manual-token-number { color: #b5cea8 !important; }
      .manual-token-comment { color: #6a9955 !important; font-style: italic !important; }
      .manual-token-function { color: #dcdcaa !important; }
      .manual-token-variable { color: #9cdcfe !important; }
      .manual-token-parameter { color: #9cdcfe !important; }
      .manual-token-type { color: #4ec9b0 !important; }
      .manual-token-class { color: #4ec9b0 !important; }
      .manual-token-operator { color: #d4d4d4 !important; }
    `;
    document.head.appendChild(style);
    console.log('🎨 MANUAL: Added manual token CSS styles');
  }
}

// Hover provider for enhanced token information
export class TrivilHoverProvider implements monaco.languages.HoverProvider {
  private errorDetector = new TrivilErrorDetector();
  private lastErrors: TrivilError[] = [];

  async provideHover(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    token: monaco.CancellationToken
  ): Promise<monaco.languages.Hover | null> {
    try {
      console.log('🔍 HOVER: Hover requested at position', position.lineNumber, ':', position.column);
      
      // Get available tokens
      const allTokens = (window as any).latestTrivilTokens || [];
      console.log('🔍 HOVER: Available tokens count:', allTokens.length);
      
      // Detect errors for current code
      if (allTokens && allTokens.length > 0) {
        try {
          this.lastErrors = await this.errorDetector.detectErrors(allTokens, model.getValue());
          console.log('🔍 HOVER: Detected', this.lastErrors.length, 'errors');
          this.lastErrors.forEach((error, i) => {
            console.log(`🔍 HOVER: Error ${i + 1}: "${error.message}" at line ${error.line}, col ${error.column}-${error.endColumn}`);
          });
          
          // Store errors globally for debugging
          (window as any).latestTrivilErrors = this.lastErrors;
        } catch (error) {
          console.warn('🔍 HOVER: Error detection failed:', error);
          this.lastErrors = [];
        }
      }

      // Check for errors at current position first
      const errorAtPosition = this.findErrorAtPosition(position);
      if (errorAtPosition) {
        console.log('🔍 HOVER: Found error at position:', errorAtPosition.message);
        return this.createErrorHover(position, errorAtPosition);
      }
      
      if (allTokens.length === 0) {
        console.warn('🔍 HOVER: No tokens available');
        return null;
      }
      
      // Find tokens at current position (deduplicated)
      const tokensAtPosition = this.findUniqueTokensAtPosition(position, allTokens);
      console.log('🔍 HOVER: Found', tokensAtPosition.length, 'unique tokens at position');
      
      if (tokensAtPosition.length === 0) {
        console.log('🔍 HOVER: No tokens found at position');
        return null;
      }
      
      // Use the first (most relevant) token for hover content
      const primaryToken = tokensAtPosition[0];
      console.log('🔍 HOVER: Primary token:', primaryToken.value, '(', primaryToken.tokenType, ')');
      
      // Create hover content for the primary token
      const hoverContent = this.createHoverContent(primaryToken, allTokens, model);
      
      if (hoverContent.length === 0) {
        console.log('🔍 HOVER: No hover content generated');
        return null;
      }
      
      // Create range for the token
      const range = new monaco.Range(
        primaryToken.startLine + 1,
        primaryToken.startColumn + 1,
        primaryToken.endLine + 1,
        primaryToken.endColumn + 1
      );
      
      const result = {
        range,
        contents: hoverContent
      };
      
      console.log('🔍 HOVER: Returning hover result:', result);
      return result;
      
    } catch (error) {
      console.error('🔍 HOVER: Error in provideHover:', error);
      return null;
    }
  }
  
  private findUniqueTokensAtPosition(position: monaco.Position, tokens: TrivilToken[]): TrivilToken[] {
    const tokensAtPosition: TrivilToken[] = [];
    const seenTokens = new Set<string>();
    
    tokens.forEach(token => {
      // Check if position is within token bounds
      const isInToken = (
        (position.lineNumber === token.startLine + 1 && position.column >= token.startColumn + 1) &&
        (position.lineNumber === token.endLine + 1 && position.column <= token.endColumn + 1)
      ) || (
        position.lineNumber > token.startLine + 1 && position.lineNumber < token.endLine + 1
      );
      
      if (isInToken) {
        // Create unique key for deduplication
        const tokenKey = `${token.value}_${token.tokenType}_${token.startLine}_${token.startColumn}`;
        if (!seenTokens.has(tokenKey)) {
          seenTokens.add(tokenKey);
          tokensAtPosition.push(token);
        }
      }
    });
    
    // Sort by specificity - prefer more specific token types
    return tokensAtPosition.sort((a, b) => {
      const priority = {
        'USER_FUNCTION': 5,
        'function.user': 5,
        'USER_VARIABLE': 4,
        'variable.user': 4,
        'FUNCTION_PARAMETER': 3,
        'variable.parameter': 3,
        'IDENTIFIER': 2,
        'KEYWORD': 1
      };
      
      const aPriority = priority[a.tokenType as keyof typeof priority] || 0;
      const bPriority = priority[b.tokenType as keyof typeof priority] || 0;
      
      return bPriority - aPriority;
    });
  }

  private createHoverContent(
    token: TrivilToken, 
    allTokens: TrivilToken[], 
    model: monaco.editor.ITextModel
  ): monaco.IMarkdownString[] {
    const { value, tokenType, semanticInfo } = token;
    
    // Check if this is a declaration or a reference
    const isDeclaration = this.isDeclaration(token, model);
    
    if (isDeclaration) {
      // For declarations, show the token type and additional info
      return this.createDeclarationHover(token);
    } else {
      // For references, find and show the declaration
      const declaration = this.findDeclaration(token, allTokens, model);
      if (declaration) {
        return this.createReferenceHover(token, declaration, model);
      } else {
        // Fallback to basic info
        return this.createBasicHover(token);
      }
    }
  }

  private isDeclaration(token: TrivilToken, model: monaco.editor.ITextModel): boolean {
    const line = model.getLineContent(token.startLine + 1);
    const { value } = token;
    
    // Check for function declarations
    if (line.includes(`фн ${value}(`)) {
      return true;
    }
    
    // Check for variable declarations
    if (line.includes(`пусть ${value}`) || line.includes(`пусть ${value} =`)) {
      return true;
    }
    
    // Check for parameter declarations (in function signature)
    const functionLinePattern = /фн\s+[а-яёА-ЯЁa-zA-Z_][а-яёА-ЯЁa-zA-Z0-9_-]*\s*\([^)]*\)/;
    const match = line.match(functionLinePattern);
    if (match && match[0].includes(`${value}:`)) {
      return true;
    }
    
    return false;
  }

  private findDeclaration(
    token: TrivilToken, 
    allTokens: TrivilToken[], 
    model: monaco.editor.ITextModel
  ): TrivilToken | null {
    const { value } = token;
    
    // Find the first occurrence of this token that is a declaration
    for (const candidateToken of allTokens) {
      if (candidateToken.value === value && this.isDeclaration(candidateToken, model)) {
        return candidateToken;
      }
    }
    
    return null;
  }

  private createDeclarationHover(token: TrivilToken): monaco.IMarkdownString[] {
    const { value, tokenType, semanticInfo } = token;
    
    let typeInfo = 'Declaration';
    let icon = '📝';
    
    // Determine the specific type of declaration
    if (tokenType.includes('function') || semanticInfo?.includes('FUNCTION')) {
      typeInfo = 'Function Declaration';
      icon = '🔧';
    } else if (tokenType.includes('variable') || semanticInfo?.includes('VARIABLE')) {
      typeInfo = 'Variable Declaration';
      icon = '📦';
    } else if (tokenType.includes('parameter') || semanticInfo?.includes('PARAMETER')) {
      typeInfo = 'Parameter Declaration';
      icon = '⚙️';
    }

    return [
      {
        value: `${icon} **${typeInfo}**\n\n\`${value}\`\n\n**Type:** ${tokenType}`,
        isTrusted: true
      }
    ];
  }

  private createReferenceHover(
    token: TrivilToken, 
    declaration: TrivilToken, 
    model: monaco.editor.ITextModel
  ): monaco.IMarkdownString[] {
    const { value } = token;
    const declarationLine = model.getLineContent(declaration.startLine + 1);
    const lineNumber = declaration.startLine + 1;
    
    let icon = '🔗';
    let referenceType = 'Reference';
    
    if (declaration.tokenType.includes('function')) {
      icon = '🔧';
      referenceType = 'Function Call';
    } else if (declaration.tokenType.includes('variable')) {
      icon = '📦';
      referenceType = 'Variable Usage';
    } else if (declaration.tokenType.includes('parameter')) {
      icon = '⚙️';
      referenceType = 'Parameter Usage';
    }

    return [
      {
        value: `${icon} **${referenceType}**\n\n\`${value}\`\n\n**Declared at line ${lineNumber}:**\n\n\`${declarationLine.trim()}\``,
        isTrusted: true
      }
    ];
  }

  private createBasicHover(token: TrivilToken): monaco.IMarkdownString[] {
    const { value, tokenType, semanticInfo } = token;
    
    let icon = '📄';
    if (tokenType.includes('keyword')) icon = '🔑';
    else if (tokenType.includes('string')) icon = '📝';
    else if (tokenType.includes('number')) icon = '🔢';
    else if (tokenType.includes('comment')) icon = '💬';
    else if (tokenType.includes('function')) icon = '🔧';
    else if (tokenType.includes('variable')) icon = '📦';
    else if (tokenType.includes('type')) icon = '🏷️';

    return [
      {
        value: `${icon} **${tokenType}**\n\n\`${value}\``,
        isTrusted: true
      }
    ];
  }

  private findErrorAtPosition(position: monaco.Position): TrivilError | null {
    console.log(`🔍 HOVER: Looking for errors at position ${position.lineNumber}:${position.column}`);
    console.log(`🔍 HOVER: Available errors:`, this.lastErrors.map(e => `${e.line}:${e.column}-${e.endLine}:${e.endColumn} "${e.message}"`));
    
    for (const error of this.lastErrors) {
      // Errors from TrivilErrorDetector are already 1-based (converted with +1)
      // Monaco Position is also 1-based
      const errorStartLine = error.line;
      const errorEndLine = error.endLine;
      const errorStartCol = error.column;
      const errorEndCol = error.endColumn;
      
      // Be more lenient with matching - allow hover on the entire error range
      const isOnSameLine = position.lineNumber === errorStartLine;
      const isInColumnRange = position.column >= errorStartCol && position.column <= errorEndCol;
      
      // For multi-line errors (rare), check if position is within bounds
      const isInMultiLineError = (
        position.lineNumber >= errorStartLine &&
        position.lineNumber <= errorEndLine &&
        (position.lineNumber > errorStartLine || position.column >= errorStartCol) &&
        (position.lineNumber < errorEndLine || position.column <= errorEndCol)
      );
      
      const isInError = isOnSameLine ? isInColumnRange : isInMultiLineError;
      
      console.log(`🔍 HOVER: Error ${errorStartLine}:${errorStartCol}-${errorEndLine}:${errorEndCol}`);
      console.log(`🔍 HOVER: - Same line: ${isOnSameLine}, In column range: ${isInColumnRange}`);
      console.log(`🔍 HOVER: - Match result: ${isInError}`);
      
      if (isInError) {
        console.log(`🔍 HOVER: ✅ Found matching error: "${error.message}"`);
        return error;
      }
    }
    
    console.log(`🔍 HOVER: ❌ No error found at position ${position.lineNumber}:${position.column}`);
    return null;
  }

  private createErrorHover(position: monaco.Position, error: TrivilError): monaco.languages.Hover {
    const severityIcon = {
      'error': '🚨',
      'warning': '⚠️',
      'info': 'ℹ️'
    };

    const errorTypeLabel = {
      'syntax': 'Syntax Error',
      'undeclared': 'Undeclared Identifier',
      'type': 'Type Error',
      'scope': 'Scope Error',
      'parameter': 'Parameter Error'
    };

    const icon = severityIcon[error.severity];
    const typeLabel = errorTypeLabel[error.errorType];

    // Ensure coordinates are correct for Monaco Range (should match the marker coordinates)
    const hoverRange = new monaco.Range(
      error.line,     // Start line (1-based) 
      error.column,   // Start column (1-based)
      error.endLine,  // End line (1-based)
      error.endColumn // End column (1-based)
    );

    console.log(`🔍 HOVER: Creating error hover at range ${error.line}:${error.column}-${error.endLine}:${error.endColumn}`);

    return {
      range: hoverRange,
      contents: [{
        value: `${icon} **${typeLabel}**\n\n${error.message}\n\n` +
               (error.code ? `**Error Code:** \`${error.code}\`\n\n` : '') +
               `**Line:** ${error.line}, **Column:** ${error.column}`,
        isTrusted: true
      }]
    };
  }
}

// Type definitions for completion system
interface CompletionContext {
  type: 'identifier' | 'parameter' | 'assignment' | 'type' | 'import' | 'functionDeclaration' | 'memberAccess';
  partialWord?: string;
  functionName?: string | null;
  parameterIndex?: number;
  isNewVariable?: boolean;
  isParameter?: boolean;
  objectName?: string | null;
}

interface TokenScope {
  blockLevel: number;
  startLine: number;
  endLine: number;
  isGlobal: boolean;
}

interface VariableInfo {
  name: string;
  type: string;
  scope: TokenScope;
  line: number;
}

interface FunctionParameter {
  name: string;
  type: string;
}

interface FunctionInfo {
  name: string;
  returnType: string;
  parameters: FunctionParameter[];
  scope: TokenScope;
  line: number;
}

interface TypeInfo {
  name: string;
  isBuiltin: boolean;
}

interface ScopeAnalysis {
  availableVariables: VariableInfo[];
  availableFunctions: FunctionInfo[];
  availableTypes: TypeInfo[];
  currentBlockLevel: number;
  inFunction: string | null;
  inClass: string | null;
}

// Advanced completion provider with scope awareness
export class TrivilCompletionProvider implements monaco.languages.CompletionItemProvider {
  
  async provideCompletionItems(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    context: monaco.languages.CompletionContext,
    token: monaco.CancellationToken
  ): Promise<monaco.languages.CompletionList> {
    try {
      console.log('🔍 COMPLETION: ===== COMPLETION PROVIDER CALLED =====');
      console.log('🔍 COMPLETION: Position:', position.lineNumber, ':', position.column);
      console.log('🔍 COMPLETION: Context:', context.triggerKind, context.triggerCharacter);
      
      // Get current tokens
      const allTokens = (window as any).latestTrivilTokens || [];
      console.log('🔍 COMPLETION: Available tokens:', allTokens.length);
      
      if (allTokens.length === 0) {
        console.warn('🔍 COMPLETION: No tokens available, providing basic completions');
        return this.getBasicCompletions();
      }
      
      // Get current line content for context analysis
      const currentLine = model.getLineContent(position.lineNumber);
      const beforeCursor = currentLine.substring(0, position.column - 1);
      const afterCursor = currentLine.substring(position.column - 1);
      
      console.log('🔍 COMPLETION: Current line:', `"${currentLine}"`);
      console.log('🔍 COMPLETION: Before cursor:', `"${beforeCursor}"`);
      console.log('🔍 COMPLETION: After cursor:', `"${afterCursor}"`);
      
      // Analyze context to determine what kind of completion is needed
      const completionContext = this.analyzeCompletionContext(beforeCursor, afterCursor, allTokens);
      console.log('🔍 COMPLETION: Completion context:', completionContext);
      
      // Get scope-aware suggestions
      const scopeAnalysis = this.analyzeScopeAtPosition(position, allTokens, model);
      console.log('🔍 COMPLETION: Scope analysis:', scopeAnalysis);
      
      // Generate completions based on context and scope
      const completions = this.generateCompletions(completionContext, scopeAnalysis, allTokens);
      console.log('🔍 COMPLETION: Generated', completions.length, 'completions');
      
      return {
        suggestions: completions,
        incomplete: false
      };
      
    } catch (error) {
      console.error('🔍 COMPLETION: Error providing completions:', error);
      return this.getBasicCompletions();
    }
  }
  
  private analyzeCompletionContext(beforeCursor: string, afterCursor: string, tokens: TrivilToken[]): CompletionContext {
    const trimmedBefore = beforeCursor.trim();
    
    // Check for function call context (inside parentheses)
    if (this.isInFunctionCall(beforeCursor)) {
      return {
        type: 'parameter',
        functionName: this.extractFunctionName(beforeCursor),
        parameterIndex: this.getParameterIndex(beforeCursor)
      };
    }
    
    // Check for assignment context
    if (trimmedBefore.includes('=') && !trimmedBefore.includes('==')) {
      return {
        type: 'assignment',
        isNewVariable: trimmedBefore.includes('пусть')
      };
    }
    
    // Check for type annotation context
    if (trimmedBefore.endsWith(':')) {
      return {
        type: 'type',
        isParameter: this.isInParameterList(beforeCursor)
      };
    }
    
    // Check for import context
    if (trimmedBefore.includes('импорт')) {
      return {
        type: 'import'
      };
    }
    
    // Check for function declaration context
    if (trimmedBefore.includes('фн ') && beforeCursor.includes('(')) {
      return {
        type: 'functionDeclaration'
      };
    }
    
    // Check for object/member access
    if (trimmedBefore.endsWith('.')) {
      const objectName = this.extractObjectName(beforeCursor);
      return {
        type: 'memberAccess',
        objectName
      };
    }
    
    // Default to variable/identifier context
    return {
      type: 'identifier',
      partialWord: this.extractPartialWord(beforeCursor)
    };
  }
  
  private analyzeScopeAtPosition(position: monaco.Position, tokens: TrivilToken[], model: monaco.editor.ITextModel): ScopeAnalysis {
    const scopeInfo: ScopeAnalysis = {
      availableVariables: [],
      availableFunctions: [],
      availableTypes: [],
      currentBlockLevel: 0,
      inFunction: null,
      inClass: null
    };
    
    // Find current block level by counting braces
    for (let line = 1; line <= position.lineNumber; line++) {
      const lineContent = model.getLineContent(line);
      for (const char of lineContent) {
        if (char === '{') scopeInfo.currentBlockLevel++;
        if (char === '}') scopeInfo.currentBlockLevel--;
      }
    }
    
    console.log('🔍 COMPLETION: Current block level:', scopeInfo.currentBlockLevel);
    
    // Check if we're inside a function to get its parameters
    const currentFunction = this.findCurrentFunction(position, tokens, model);
    if (currentFunction) {
      console.log('🔍 COMPLETION: Inside function:', currentFunction.name);
      scopeInfo.inFunction = currentFunction.name;
      
      // Add function parameters to scope
      currentFunction.parameters.forEach(param => {
        scopeInfo.availableVariables.push({
          name: param.name,
          type: param.type,
          scope: { blockLevel: 0, startLine: 1, endLine: 999999, isGlobal: false },
          line: currentFunction.line
        });
      });
      console.log('🔍 COMPLETION: Added', currentFunction.parameters.length, 'function parameters to scope');
    }
    
    // Check if we're in вход block (main function equivalent)
    const isInVkhodBlock = this.isInVkhodBlock(position, model);
    console.log('🔍 COMPLETION: In вход block:', isInVkhodBlock);
    
    // Analyze tokens to find available symbols in scope
    const seenVariables = new Set<string>();
    const seenFunctions = new Set<string>();
    
    console.log('🔍 COMPLETION: Analyzing tokens for scope...');
    
    tokens.forEach(token => {
      const tokenPosition = { line: token.startLine + 1, column: token.startColumn + 1 };
      
      // Only consider tokens before current position
      if (tokenPosition.line > position.lineNumber || 
          (tokenPosition.line === position.lineNumber && tokenPosition.column >= position.column)) {
        return;
      }
      
      // Determine if token is in scope
      const tokenScope = this.getTokenScope(token, tokens, model);
      const isInScope = this.isTokenInScope(tokenScope, position, scopeInfo.currentBlockLevel) || isInVkhodBlock;
      
      console.log(`🔍 TOKEN: "${token.value}" (${token.tokenType}) at line ${tokenPosition.line}:`);
      console.log(`  - Token scope: blockLevel=${tokenScope.blockLevel}, isGlobal=${tokenScope.isGlobal}`);
      console.log(`  - In scope: ${isInScope}, In вход: ${isInVkhodBlock}`);
      
      if (!isInScope) return;
      
      // Categorize available symbols (avoid duplicates)
      switch (token.tokenType) {
        case 'IDENTIFIER':
        case 'USER_VARIABLE':
        case 'variable.user':
          if (this.isVariableDeclaration(token, tokens, model) && !seenVariables.has(token.value)) {
            seenVariables.add(token.value);
            console.log(`  ✅ Added variable: ${token.value}`);
            scopeInfo.availableVariables.push({
              name: token.value,
              type: this.inferVariableType(token, tokens, model),
              scope: tokenScope,
              line: token.startLine + 1
            });
          }
          break;
          
        case 'USER_FUNCTION':
        case 'function.user':
          if (this.isFunctionDeclaration(token, tokens, model) && !seenFunctions.has(token.value)) {
            seenFunctions.add(token.value);
            console.log(`  ✅ Added function: ${token.value}`);
            scopeInfo.availableFunctions.push({
              name: token.value,
              returnType: this.inferFunctionReturnType(token, tokens, model),
              parameters: this.extractFunctionParameters(token, tokens, model),
              scope: tokenScope,
              line: token.startLine + 1
            });
          }
          break;
          
        case 'BUILT_IN_TYPE':
        case 'type.builtin':
          scopeInfo.availableTypes.push({
            name: token.value,
            isBuiltin: true
          });
          break;
      }
    });
    
    // Add built-in keywords and functions that are always available
    this.addBuiltinCompletions(scopeInfo);
    
    console.log('🔍 COMPLETION: Found', scopeInfo.availableVariables.length, 'variables in scope');
    console.log('🔍 COMPLETION: Found', scopeInfo.availableFunctions.length, 'functions in scope');
    
    return scopeInfo;
  }
  
  private getTokenScope(token: TrivilToken, allTokens: TrivilToken[], model: monaco.editor.ITextModel): TokenScope {
    // Find the block level where this token is declared
    let blockLevel = 0;
    let startLine = 1;
    let endLine = model.getLineCount();
    
    // Count braces up to token position
    for (let line = 1; line <= token.startLine + 1; line++) {
      const lineContent = model.getLineContent(line);
      for (let col = 0; col < lineContent.length; col++) {
        if (line === token.startLine + 1 && col >= token.startColumn) break;
        
        if (lineContent[col] === '{') {
          blockLevel++;
        } else if (lineContent[col] === '}') {
          blockLevel--;
        }
      }
    }
    
    // For function declarations at top level, they should be considered global
    if (blockLevel === 0 && this.isFunctionDeclaration(token, allTokens, model)) {
      return {
        blockLevel: 0,
        startLine: token.startLine + 1,
        endLine: model.getLineCount(),
        isGlobal: true
      };
    }
    
    // Find the end of current block
    let currentLevel = blockLevel;
    for (let line = token.startLine + 1; line <= model.getLineCount(); line++) {
      const lineContent = model.getLineContent(line);
      for (const char of lineContent) {
        if (char === '{') currentLevel++;
        if (char === '}') {
          currentLevel--;
          if (currentLevel < blockLevel) {
            endLine = line;
            break;
          }
        }
      }
      if (endLine < model.getLineCount()) break;
    }
    
    return {
      blockLevel,
      startLine,
      endLine,
      isGlobal: blockLevel === 0
    };
  }
  
  private isTokenInScope(tokenScope: TokenScope, currentPosition: monaco.Position, currentBlockLevel: number): boolean {
    // Global scope is always available
    if (tokenScope.isGlobal) return true;
    
    // Token must be in current or parent scope
    if (tokenScope.blockLevel > currentBlockLevel) return false;
    
    // Token must be declared before current position
    if (tokenScope.startLine > currentPosition.lineNumber) return false;
    
    // Token must not be out of scope (past closing brace)
    if (currentPosition.lineNumber > tokenScope.endLine) return false;
    
    return true;
  }
  
  private generateCompletions(context: CompletionContext, scope: ScopeAnalysis, tokens: TrivilToken[]): any[] {
    const completions: any[] = [];
    
    switch (context.type) {
      case 'identifier':
        // Add variables in scope
        scope.availableVariables.forEach((variable: VariableInfo) => {
          if (!context.partialWord || variable.name.startsWith(context.partialWord)) {
            completions.push({
              label: variable.name,
              kind: monaco.languages.CompletionItemKind.Variable,
              detail: `${variable.type} (line ${variable.line})`,
              documentation: `Variable declared at line ${variable.line}`,
              insertText: variable.name,
              sortText: `1_${variable.name}` // Priority for variables
            });
          }
        });
        
        // Add functions in scope
        scope.availableFunctions.forEach((func: FunctionInfo) => {
          if (!context.partialWord || func.name.startsWith(context.partialWord)) {
            const paramList = func.parameters.map(p => `${p.name}: ${p.type}`).join(', ');
            completions.push({
              label: func.name,
              kind: monaco.languages.CompletionItemKind.Function,
              detail: `фн ${func.name}(${paramList}): ${func.returnType}`,
              documentation: `Function declared at line ${func.line}`,
              insertText: `${func.name}($1)`,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              sortText: `2_${func.name}` // Priority for functions
            });
          }
        });
        
        // Add keywords
        this.getKeywordCompletions().forEach(completion => {
          const label = typeof completion.label === 'string' ? completion.label : completion.label.label;
          if (!context.partialWord || label.startsWith(context.partialWord)) {
            completions.push(completion);
          }
        });
        break;
        
      case 'type':
        // Add available types
        scope.availableTypes.forEach((type: TypeInfo) => {
          completions.push({
            label: type.name,
            kind: monaco.languages.CompletionItemKind.TypeParameter,
            detail: type.isBuiltin ? 'Built-in type' : 'User type',
            insertText: type.name,
            sortText: `1_${type.name}`
          });
        });
        break;
        
      case 'parameter':
        // Add variables and parameters available in current scope
        scope.availableVariables.forEach((variable: VariableInfo) => {
          completions.push({
            label: variable.name,
            kind: monaco.languages.CompletionItemKind.Variable,
            detail: variable.type,
            insertText: variable.name,
            sortText: `1_${variable.name}`
          });
        });
        break;
        
      case 'assignment':
        // Add both variables and functions for assignments
        scope.availableVariables.forEach((variable: VariableInfo) => {
          completions.push({
            label: variable.name,
            kind: monaco.languages.CompletionItemKind.Variable,
            detail: variable.type,
            insertText: variable.name,
            sortText: `1_${variable.name}`
          });
        });
        
        // Add functions in assignment context (can assign function results)
        scope.availableFunctions.forEach((func: FunctionInfo) => {
          const paramList = func.parameters.map(p => `${p.name}: ${p.type}`).join(', ');
          completions.push({
            label: func.name,
            kind: monaco.languages.CompletionItemKind.Function,
            detail: `фн ${func.name}(${paramList}): ${func.returnType}`,
            documentation: `Function declared at line ${func.line}`,
            insertText: `${func.name}($1)`,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            sortText: `2_${func.name}` // Priority for functions
          });
        });
        break;
    }
    
    console.log('🔍 COMPLETION: Generated completions by type:', {
      variables: completions.filter(c => c.kind === monaco.languages.CompletionItemKind.Variable).length,
      functions: completions.filter(c => c.kind === monaco.languages.CompletionItemKind.Function).length,
      keywords: completions.filter(c => c.kind === monaco.languages.CompletionItemKind.Keyword).length,
      types: completions.filter(c => c.kind === monaco.languages.CompletionItemKind.TypeParameter).length
    });
    
    return completions;
  }
  
  private getKeywordCompletions(): any[] {
    const keywords = [
      { word: 'пусть', desc: 'Variable declaration' },
      { word: 'если', desc: 'Conditional statement' },
      { word: 'иначе', desc: 'Else clause' },
      { word: 'пока', desc: 'While loop' },
      { word: 'для', desc: 'For loop' },
      { word: 'фн', desc: 'Function declaration' },
      { word: 'возврат', desc: 'Return statement' },
      { word: 'вернуть', desc: 'Return statement' },
      { word: 'прервать', desc: 'Break statement' },
      { word: 'продолжить', desc: 'Continue statement' },
      { word: 'истина', desc: 'Boolean true' },
      { word: 'ложь', desc: 'Boolean false' }
    ];
    
    return keywords.map(kw => ({
      label: kw.word,
      kind: monaco.languages.CompletionItemKind.Keyword,
      detail: kw.desc,
      insertText: kw.word,
      sortText: `3_${kw.word}` // Lower priority for keywords
    }));
  }
  
  private getBasicCompletions(): monaco.languages.CompletionList {
    return {
      suggestions: this.getKeywordCompletions(),
      incomplete: false
    };
  }
  
  // Helper methods for context analysis
  private isInFunctionCall(beforeCursor: string): boolean {
    let parenCount = 0;
    for (let i = beforeCursor.length - 1; i >= 0; i--) {
      if (beforeCursor[i] === ')') parenCount++;
      if (beforeCursor[i] === '(') {
        parenCount--;
        if (parenCount < 0) return true;
      }
      if (beforeCursor[i] === ';' || beforeCursor[i] === '{' || beforeCursor[i] === '}') break;
    }
    return false;
  }
  
  private extractFunctionName(beforeCursor: string): string | null {
    const match = beforeCursor.match(/([а-яёА-ЯЁa-zA-Z_$][а-яёА-ЯЁa-zA-Z0-9_$]*)\s*\([^)]*$/);
    return match ? match[1] : null;
  }
  
  private getParameterIndex(beforeCursor: string): number {
    let parenCount = 0;
    let commaCount = 0;
    
    for (let i = beforeCursor.length - 1; i >= 0; i--) {
      if (beforeCursor[i] === ')') parenCount++;
      if (beforeCursor[i] === '(') {
        parenCount--;
        if (parenCount < 0) break;
      }
      if (parenCount === 0 && beforeCursor[i] === ',') {
        commaCount++;
      }
    }
    
    return commaCount;
  }
  
  private isInParameterList(beforeCursor: string): boolean {
    return beforeCursor.includes('фн ') && beforeCursor.includes('(') && !beforeCursor.includes(')');
  }
  
  private extractObjectName(beforeCursor: string): string | null {
    const match = beforeCursor.match(/([а-яёА-ЯЁa-zA-Z_$][а-яёА-ЯЁa-zA-Z0-9_$]*)\s*\.$/);
    return match ? match[1] : null;
  }
  
  private extractPartialWord(beforeCursor: string): string {
    const match = beforeCursor.match(/([а-яёА-ЯЁa-zA-Z_$][а-яёА-ЯЁa-zA-Z0-9_$]*)$/);
    return match ? match[1] : '';
  }
  
  private isVariableDeclaration(token: TrivilToken, tokens: TrivilToken[], model: monaco.editor.ITextModel): boolean {
    // Check if token is preceded by 'пусть' or is in assignment
    const tokenLine = model.getLineContent(token.startLine + 1);
    return tokenLine.includes('пусть') || tokenLine.includes('=');
  }
  
  private isFunctionDeclaration(token: TrivilToken, tokens: TrivilToken[], model: monaco.editor.ITextModel): boolean {
    const tokenLine = model.getLineContent(token.startLine + 1);
    return tokenLine.includes('фн ') && tokenLine.includes('(');
  }
  
  private inferVariableType(token: TrivilToken, tokens: TrivilToken[], model: monaco.editor.ITextModel): string {
    // Try to infer type from context
    const line = model.getLineContent(token.startLine + 1);
    
    // Look for explicit type annotation
    const typeMatch = line.match(/:\s*([а-яёА-ЯЁa-zA-Z_$][а-яёА-ЯЁa-zA-Z0-9_$]*)/);
    if (typeMatch) return typeMatch[1];
    
    // Infer from assignment
    if (line.includes('=')) {
      if (line.includes('"')) return 'Строка';
      if (line.match(/=\s*\d+/)) return 'Цел64';
      if (line.match(/=\s*\d+\.\d+/)) return 'Вещ64';
      if (line.includes('истина') || line.includes('ложь')) return 'Лог';
    }
    
    return 'unknown';
  }
  
  private inferFunctionReturnType(token: TrivilToken, tokens: TrivilToken[], model: monaco.editor.ITextModel): string {
    const line = model.getLineContent(token.startLine + 1);
    const returnTypeMatch = line.match(/:\s*([а-яёА-ЯЁa-zA-Z_$][а-яёА-ЯЁa-zA-Z0-9_$]*)\s*\{/);
    return returnTypeMatch ? returnTypeMatch[1] : 'Пусто';
  }
  
  private extractFunctionParameters(token: TrivilToken, tokens: TrivilToken[], model: monaco.editor.ITextModel): FunctionParameter[] {
    const line = model.getLineContent(token.startLine + 1);
    const paramMatch = line.match(/\(([^)]*)\)/);
    
    if (!paramMatch || !paramMatch[1].trim()) return [];
    
    const paramString = paramMatch[1];
    const params = paramString.split(',').map(p => p.trim());
    
    return params.map(param => {
      const colonIndex = param.indexOf(':');
      if (colonIndex > 0) {
        return {
          name: param.substring(0, colonIndex).trim(),
          type: param.substring(colonIndex + 1).trim()
        };
      }
      return {
        name: param,
        type: 'unknown'
      };
    });
  }
  
  private addBuiltinCompletions(scope: ScopeAnalysis): void {
    // Add built-in types
    const builtinTypes = ['Цел64', 'Слово64', 'Вещ64', 'Лог', 'Строка', 'Символ', 'Байт', 'Пусто'];
    builtinTypes.forEach(type => {
      scope.availableTypes.push({ name: type, isBuiltin: true });
    });
    
    // Add built-in functions
    const builtinFunctions = [
      { name: 'вывод', returnType: 'Пусто', parameters: [{ name: 'сообщение', type: 'Строка' }] },
      { name: 'ввод', returnType: 'Строка', parameters: [] },
      { name: 'длина', returnType: 'Цел64', parameters: [{ name: 'строка', type: 'Строка' }] }
    ];
    
    builtinFunctions.forEach(func => {
      scope.availableFunctions.push({
        name: func.name,
        returnType: func.returnType,
        parameters: func.parameters,
        scope: { blockLevel: 0, startLine: 1, endLine: 999999, isGlobal: true },
        line: 0
      });
    });
  }

  private findCurrentFunction(position: monaco.Position, tokens: TrivilToken[], model: monaco.editor.ITextModel): FunctionInfo | null {
    // Look for function declaration before current position
    for (let line = position.lineNumber; line >= 1; line--) {
      const lineContent = model.getLineContent(line);
      
      // Check if this line contains a function declaration
      if (lineContent.includes('фн ')) {
        // Find the function token on this line
        const functionToken = tokens.find(token => 
          token.startLine + 1 === line && 
          (token.tokenType === 'USER_FUNCTION' || token.tokenType === 'function.user') &&
          this.isFunctionDeclaration(token, tokens, model)
        );
        
        if (functionToken) {
          // Check if we're inside this function's body (after the opening brace)
          let braceFound = false;
          let braceLevel = 0;
          
          for (let checkLine = line; checkLine <= position.lineNumber; checkLine++) {
            const checkContent = model.getLineContent(checkLine);
            for (const char of checkContent) {
              if (char === '{') {
                braceFound = true;
                braceLevel++;
              }
              if (char === '}') {
                braceLevel--;
                if (braceLevel === 0 && braceFound) {
                  // We've closed the function, not inside anymore
                  return null;
                }
              }
            }
          }
          
          if (braceFound && braceLevel > 0) {
            // We're inside this function
            return {
              name: functionToken.value,
              returnType: this.inferFunctionReturnType(functionToken, tokens, model),
              parameters: this.extractFunctionParameters(functionToken, tokens, model),
              scope: this.getTokenScope(functionToken, tokens, model),
              line: functionToken.startLine + 1
            };
          }
        }
      }
    }
    
    return null;
  }
  
  private isInVkhodBlock(position: monaco.Position, model: monaco.editor.ITextModel): boolean {
    // Look for "вход" keyword before current position
    for (let line = position.lineNumber; line >= 1; line--) {
      const lineContent = model.getLineContent(line);
      
      if (lineContent.includes('вход')) {
        // Check if we're inside the вход block
        let braceFound = false;
        let braceLevel = 0;
        
        for (let checkLine = line; checkLine <= position.lineNumber; checkLine++) {
          const checkContent = model.getLineContent(checkLine);
          for (const char of checkContent) {
            if (char === '{') {
              braceFound = true;
              braceLevel++;
            }
            if (char === '}') {
              braceLevel--;
              if (braceLevel === 0 && braceFound) {
                // We've closed the вход block
                return false;
              }
            }
          }
        }
        
        return braceFound && braceLevel > 0;
      }
    }
    
    return false;
  }
}

// Language configuration
const TrivilLanguageConfiguration: monaco.languages.LanguageConfiguration = {
  comments: {
    lineComment: '//',
    blockComment: ['/*', '*/']
  },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')']
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
    { open: "'", close: "'" }
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
    { open: "'", close: "'" }
  ]
};

// Setup function with both basic and semantic highlighting
export function setupTrivilLanguageSupport(
  theme: 'dark' | 'light' = 'dark',
  onTokensRequest?: (code: string) => Promise<TrivilToken[]>
): void {
  console.log('=== 🚀 LANGUAGE SETUP START ===');
  console.log('🚀 LANGUAGE: Setting up Trivil language support');
  console.log('🚀 LANGUAGE: Theme:', theme);
  console.log('🚀 LANGUAGE: Has onTokensRequest callback:', !!onTokensRequest);
  console.log('🚀 LANGUAGE: Monaco available:', !!monaco);
  console.log('🚀 LANGUAGE: Current time:', new Date().toISOString());
  
  // Skip custom theme definitions - use built-in Monaco themes for reliable theme switching
  console.log('🚀 LANGUAGE: Using built-in Monaco themes (vs-dark/vs) for consistent theme switching');
  
  // STEP 1: Register language if not already registered
  const existingLanguages = monaco.languages.getLanguages();
  const trivilExists = existingLanguages.some(lang => lang.id === 'trivil');
  console.log('🚀 LANGUAGE: Existing languages:', existingLanguages.map(l => l.id));
  console.log('🚀 LANGUAGE: Trivil already exists:', trivilExists);
  
  if (!trivilExists) {
    console.log('🚀 LANGUAGE: Registering Trivil language');
    monaco.languages.register({ id: 'trivil' });
    
    // STEP 2: Set language configuration
    monaco.languages.setLanguageConfiguration('trivil', {
      comments: {
        lineComment: '//',
        blockComment: ['/*', '*/']
      },
      brackets: [
        ['{', '}'],
        ['[', ']'],
        ['(', ')']
      ],
      autoClosingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: "'", close: "'" }
      ],
      surroundingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: "'", close: "'" }
      ]
    });
    
    // STEP 3: Set basic monarch tokenizer for immediate highlighting
    console.log('🚀 LANGUAGE: Setting Monarch tokenizer');
    try {
      monaco.languages.setMonarchTokensProvider('trivil', TRIVIL_MONARCH_LANGUAGE);
      console.log('🚀 LANGUAGE: Monarch tokenizer set successfully');
    } catch (error) {
      console.error('🚀 LANGUAGE: Error setting Monarch tokenizer:', error);
    }
    
    console.log('🚀 LANGUAGE: Trivil language registration complete');
  } else {
    console.log('🚀 LANGUAGE: Trivil language already registered');
  }
  
  // STEP 4: IMMEDIATE hover provider registration (right after language setup)
  console.log('🚀 LANGUAGE: === REGISTERING HOVER PROVIDER IMMEDIATELY ===');
  try {
    // Dispose existing providers if any to avoid duplicates
    const existingDisposables = (window as any).trivilHoverDisposables;
    if (existingDisposables) {
      console.log('🚀 LANGUAGE: Disposing existing hover providers...');
      existingDisposables.forEach((disposable: any) => {
        try {
          disposable.dispose();
          console.log('🚀 LANGUAGE: Disposed one hover provider');
        } catch (e) {
          console.warn('🚀 LANGUAGE: Error disposing existing hover provider:', e);
        }
      });
    }
    
    console.log('🚀 LANGUAGE: Creating new TrivilHoverProvider instance...');
    const hoverProvider = new TrivilHoverProvider();
    console.log('🚀 LANGUAGE: TrivilHoverProvider created successfully');
    
    // Register for multiple language IDs with extensive logging
    console.log('🚀 LANGUAGE: Registering hover provider for "trivil"...');
    const disposable1 = monaco.languages.registerHoverProvider('trivil', hoverProvider);
    console.log('🚀 LANGUAGE: ✅ Registered for "trivil":', !!disposable1);
    
    console.log('🚀 LANGUAGE: Registering hover provider for "plaintext"...');
    const disposable2 = monaco.languages.registerHoverProvider('plaintext', hoverProvider);
    console.log('🚀 LANGUAGE: ✅ Registered for "plaintext":', !!disposable2);
    
    console.log('🚀 LANGUAGE: Registering hover provider for "javascript"...');
    const disposable3 = monaco.languages.registerHoverProvider('javascript', hoverProvider);
    console.log('🚀 LANGUAGE: ✅ Registered for "javascript":', !!disposable3);
    
    console.log('🚀 LANGUAGE: All hover provider registrations complete');
    console.log('🚀 LANGUAGE: Hover provider disposables:', { disposable1, disposable2, disposable3 });
    
    // Store references globally for debugging and persistence
    (window as any).trivilHoverProvider = hoverProvider;
    (window as any).trivilHoverDisposables = [disposable1, disposable2, disposable3];
    console.log('🚀 LANGUAGE: Stored hover provider globally');
    
    // Immediate verification test
    console.log('🚀 LANGUAGE: === IMMEDIATE HOVER TEST ===');
    const editors = monaco.editor.getEditors();
    console.log('🚀 LANGUAGE: Found editors:', editors.length);
    
    if (editors.length > 0) {
      const model = editors[0].getModel();
      console.log('🚀 LANGUAGE: First editor model:', !!model);
      
      if (model) {
        console.log('🚀 LANGUAGE: Model language ID:', model.getLanguageId());
        console.log('🚀 LANGUAGE: Model content length:', model.getValue().length);
        
        // Test hover immediately
        const position = new monaco.Position(5, 10);
        const cancellationToken = { 
          isCancellationRequested: false, 
          onCancellationRequested: () => ({ dispose: () => {} })
        };
        
        console.log('🚀 LANGUAGE: Testing hover provider at position 5:10...');
        hoverProvider.provideHover(model, position, cancellationToken as any)
          .then(result => {
            console.log('🚀 LANGUAGE: ✅ IMMEDIATE hover test result:', result);
          })
          .catch((error: unknown) => {
            console.error('🚀 LANGUAGE: ❌ IMMEDIATE hover test failed:', error);
          });
      }
    }
    
  } catch (error) {
    console.error('🚀 LANGUAGE: ❌❌❌ CRITICAL ERROR in hover provider registration:', error);
    console.error('🚀 LANGUAGE: Error stack:', error instanceof Error ? error.stack : 'No stack trace');
  }
  
  // STEP 5: Register semantic token provider for enhanced highlighting (always try)
  if (onTokensRequest) {
    console.log('🚀 LANGUAGE: Registering semantic token provider');
    try {
      const provider = new TrivilSemanticTokenProvider(onTokensRequest);
      
      // Test the legend
      const legend = provider.getLegend();
      console.log('🚀 LANGUAGE: Semantic token legend:', legend);
      
      // Register the provider
      const disposable = monaco.languages.registerDocumentSemanticTokensProvider('trivil', provider);
      console.log('🚀 LANGUAGE: ✅ Semantic token provider registered successfully');
      console.log('🚀 LANGUAGE: Provider disposable:', disposable);
      
      // Verify registration
      const registeredLanguages = monaco.languages.getLanguages();
      console.log('🚀 LANGUAGE: All registered languages:', registeredLanguages.map(l => l.id));
      
      // Store provider globally for debugging
      (window as any).trivilSemanticProvider = provider;
      
      // Force semantic highlighting refresh after a delay
      setTimeout(() => {
        console.log('🚀 LANGUAGE: 🔄 Gentle semantic token setup...');
        try {
          // Get all models and check their language
          const models = monaco.editor.getModels();
          console.log('🚀 LANGUAGE: Found', models.length, 'editor models');
          
          models.forEach((model, i) => {
            console.log(`🚀 LANGUAGE: Model ${i} language: "${model.getLanguageId()}"`);
            console.log(`🚀 LANGUAGE: Model ${i} content length: ${model.getValue().length}`);
            
            if (model.getLanguageId() === 'trivil') {
              console.log(`🚀 LANGUAGE: ✅ Model ${i} is Trivil - semantic tokens ready`);
              
              // Don't force refresh to prevent blinking - let Monaco handle it naturally
              console.log(`🚀 LANGUAGE: Model ${i} semantic highlighting ready`);
            }
          });
          
          // Test provider gently without forcing refresh
          console.log('🚀 LANGUAGE: 🧪 Testing provider gently...');
          const testModel = models.find(m => m.getLanguageId() === 'trivil');
          if (testModel) {
            provider.provideDocumentSemanticTokens(testModel, null, { isCancellationRequested: false } as any)
              .then(result => {
                console.log('🚀 LANGUAGE: 🧪 Gentle provider test result:', result);
              })
              .catch(error => {
                console.error('🚀 LANGUAGE: 🧪 Gentle provider test failed:', error);
              });
          }
          
        } catch (refreshError) {
          console.error('🚀 LANGUAGE: Error during gentle semantic setup:', refreshError);
        }
      }, 2000); // Longer delay for stable setup
      
    } catch (error) {
      console.error('🚀 LANGUAGE: ❌ Error registering semantic token provider:', error);
      console.error('🚀 LANGUAGE: Error stack:', error instanceof Error ? error.stack : 'No stack');
    }
  } else {
    console.warn('🚀 LANGUAGE: ⚠️ No onTokensRequest callback provided - semantic highlighting disabled');
  }
  
  // Theme handling is now managed by CodeEditor component for consistency
  console.log('🚀 LANGUAGE: Theme management delegated to CodeEditor component');
  
  console.log('=== 🚀 LANGUAGE SETUP COMPLETE ===');
}

// Error detection interfaces and types
export interface TrivilError {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  errorType: 'syntax' | 'undeclared' | 'type' | 'scope' | 'parameter';
  code?: string;
}

export interface ErrorContext {
  undeclaredIdentifiers: Set<string>;
  declaredVariables: Map<string, { type: string; line: number; scope: number }>;
  declaredFunctions: Map<string, { returnType: string; params: Array<{ name: string; type: string }>; line: number }>;
  availableTypes: Set<string>;
  scopeStack: number[];
  currentScope: number;
  importedModules: Map<string, { classes: Set<string>; functions: Set<string>; modules: Set<string> }>;
}

// Comprehensive error detector
export class TrivilErrorDetector {
  private tokens: TrivilToken[] = [];
  private errors: TrivilError[] = [];
  private context: ErrorContext;

  constructor() {
    this.context = {
      undeclaredIdentifiers: new Set(),
      declaredVariables: new Map(),
      declaredFunctions: new Map(),
      availableTypes: new Set(['Цел64', 'Стр', 'Вещ64', 'Лог', 'Пусто']),
      scopeStack: [0],
      currentScope: 0,
      importedModules: new Map()
    };
  }

  async detectErrors(tokens: TrivilToken[], code: string): Promise<TrivilError[]> {
    console.log('🔍🔍🔍 ERROR DETECTION STARTED 🔍🔍🔍');
    console.log('🔍 ERROR: Starting comprehensive error detection');
    console.log('🔍 ERROR: Analyzing', tokens.length, 'tokens');
    

    
    this.tokens = tokens;
    this.errors = [];
    this.resetContext();
    
    // Phase 1: Collect declarations
    await this.collectDeclarations();
    
    // Phase 2: Detect various error types
    this.detectUndeclaredIdentifiers();
    this.detectTypeErrors();
    this.detectScopeErrors();
    this.detectParameterErrors();
    this.detectSyntaxErrors(code);
    
    console.log('🔍 ERROR: Found', this.errors.length, 'errors');
    this.errors.forEach((error, i) => {
      console.log(`🔍 ERROR ${i + 1}: [${error.line}:${error.column}-${error.endLine}:${error.endColumn}] ${error.errorType} - ${error.message}`);

    });
    
    console.log('🔍🔍🔍 ERROR DETECTION COMPLETED 🔍🔍🔍');
    
    // Enhance token types based on import detection
    this.enhanceTokenTypesWithImports();
    
    return this.errors;
  }

  private resetContext(): void {
    this.context = {
      undeclaredIdentifiers: new Set(),
      declaredVariables: new Map(),
      declaredFunctions: new Map(),
      availableTypes: new Set(['Цел64', 'Стр', 'Дщб64', 'Лог', 'Пусто']),
      scopeStack: [0],
      currentScope: 0,
      importedModules: new Map()
    };
  }

  private async collectDeclarations(): Promise<void> {
    console.log('🔍 ERROR: Phase 1 - Collecting declarations and imports');
    console.log('🔍 ERROR: Total tokens:', this.tokens.length);
    console.log('🔍 ERROR: All token values:', this.tokens.map(t => `"${t.value}"`).join(' '));
    
    // Look for import patterns anywhere in the token stream
    for (let i = 0; i < this.tokens.length; i++) {
      const token = this.tokens[i];
      
      // Check for "стд::вывод" anywhere in the tokens
      if (token.value.includes('стд::вывод')) {
        console.log(`🔍 ERROR: ✅ Found 'стд::вывод' directly in token at index ${i}: "${token.value}"`);
        await this.parseImportedModule('стд::вывод');
      }
    }
    
    for (let i = 0; i < this.tokens.length; i++) {
      const token = this.tokens[i];
      
      // Import declarations: импорт "module" - be more flexible with import keyword detection
      if ((token.value === 'импорт' || token.value === 'import') && i + 1 < this.tokens.length) {
        const importToken = this.tokens[i + 1];
        console.log(`🔍 ERROR: Checking import token: "${importToken.value}" (type: ${importToken.tokenType})`);
        
        // Be very aggressive about detecting imports - check multiple token types and patterns
        let isImportString = false;
        let modulePath = '';
        
        // Check if token looks like an import path (contains стд:: or has quotes)
        if (importToken.value.includes('стд::') || 
            importToken.value.includes('"стд::') ||
            importToken.value.startsWith('"') ||
            importToken.tokenType === 'STRING' || importToken.tokenType === 'string' || 
            importToken.tokenType === 'string_literal' || importToken.tokenType === 'STRING_LITERAL' ||
            importToken.tokenType === 'IDENTIFIER' || importToken.tokenType === 'variable.user') {
          
          isImportString = true;
          modulePath = importToken.value.replace(/"/g, '');
          console.log(`🔍 ERROR: Detected import string pattern: "${importToken.value}" -> "${modulePath}"`);
        }
        
        if (isImportString) {
          console.log(`🔍 ERROR: Found import: ${modulePath}`);
          
          // Parse module path and extract available classes/functions
          await this.parseImportedModule(modulePath);
        } else {
          console.log(`🔍 ERROR: Import token not recognized as string - skipping`);
        }
      }
      
      // Function declarations: фн functionName(
      if (token.value === 'фн' && i + 1 < this.tokens.length) {
        const funcNameToken = this.tokens[i + 1];
        if (funcNameToken.tokenType === 'IDENTIFIER' || funcNameToken.tokenType === 'variable.user') {
          const params = this.extractFunctionParams(i);
          const returnType = this.extractReturnType(i);
          
          this.context.declaredFunctions.set(funcNameToken.value, {
            returnType,
            params,
            line: funcNameToken.startLine
          });
          
          console.log(`🔍 ERROR: Found function declaration: ${funcNameToken.value}(${params.map(p => `${p.name}:${p.type}`).join(', ')}) : ${returnType}`);
        }
      }
      
      // Variable declarations: пусть varName =
      if (token.value === 'пусть' && i + 1 < this.tokens.length) {
        const varNameToken = this.tokens[i + 1];
        if (varNameToken.tokenType === 'IDENTIFIER' || varNameToken.tokenType === 'variable.user') {
          const varType = this.inferVariableTypeFromDeclaration(i);
          const scope = this.getCurrentScope(token.startLine);
          
          this.context.declaredVariables.set(varNameToken.value, {
            type: varType,
            line: varNameToken.startLine,
            scope
          });
          
          console.log(`🔍 ERROR: Found variable declaration: ${varNameToken.value} : ${varType} (scope: ${scope})`);
        }
      }
    }
    
    // Add built-in functions (but not imported ones - they're handled by imports)
    this.context.declaredFunctions.set('ввод', { returnType: 'Стр', params: [], line: -1 });
    this.context.declaredFunctions.set('размер', { returnType: 'Цел64', params: [], line: -1 });
    console.log(`🔍 ERROR: Added ${this.context.declaredFunctions.size} functions, ${this.context.declaredVariables.size} variables, and ${this.context.importedModules.size} imported modules`);
  }

  private async parseImportedModule(modulePath: string): Promise<void> {
    // Parse module by reading actual .def files from compiler directory
    console.log(`🔍 ERROR: Parsing import "${modulePath}"`);
    
    // Convert import path to file system path: "стд::вывод" -> "стд/вывод"
    const fsPath = modulePath.replace('::', '/');
    console.log(`🔍 ERROR: Converted to filesystem path: ${fsPath}`);
    
    try {
      // Try to read the .def file dynamically
      const defFilePath = `compiler/v0.79/${fsPath}/${fsPath.split('/').pop()}.def`;
      console.log(`🔍 ERROR: Attempting to read: ${defFilePath}`);
      
      const moduleInfo = await this.readModuleDefinition(defFilePath, modulePath);
      if (moduleInfo) {
        const importData = {
          classes: new Set<string>(moduleInfo.classes),
          functions: new Set<string>(moduleInfo.functions),
          modules: new Set<string>(moduleInfo.modules)
        };
        
        this.context.importedModules.set(modulePath, importData);
        console.log(`🔍 ERROR: ✅ Parsed module ${modulePath}: ${moduleInfo.classes.length} classes, ${moduleInfo.functions.length} functions, ${moduleInfo.modules.length} modules`);
        console.log(`🔍 ERROR: Functions found: [${moduleInfo.functions.join(', ')}]`);
        console.log(`🔍 ERROR: Modules found: [${moduleInfo.modules.join(', ')}]`);
        
        // Add imported classes as available variables
        moduleInfo.classes.forEach((className: string) => {
          this.context.declaredVariables.set(className, {
            type: 'ImportedClass',
            line: -1,
            scope: 0
          });
        });
        
        // Add imported modules as available namespaces for qualified calls
        moduleInfo.modules.forEach((moduleName: string) => {
          this.context.declaredVariables.set(moduleName, {
            type: 'ImportedModule',
            line: -1,
            scope: 0
          });
        });
      }
    } catch (error) {
      console.error(`🔍 ERROR: Failed to read module definition for ${modulePath}:`, error);
      console.warn(`🔍 ERROR: Using fallback definition for ${modulePath}`);
      this.useFallbackModuleDefinition(modulePath);
    }
  }

  private async readModuleDefinition(defFilePath: string, modulePath: string): Promise<{ classes: string[], functions: string[], modules: string[] } | null> {
    try {
      const response = await fetch(defFilePath);
      if (!response.ok) {
        console.warn(`🔍 ERROR: Could not fetch ${defFilePath}: ${response.status}`);
        return null;
      }
      
      const content = await response.text();
      console.log(`🔍 ERROR: Read .def file content:\n${content}`);
      
      const functions: string[] = [];
      const classes: string[] = [];
      
      // Parse .def file content to extract function names
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        
        // Look for function definitions: "фн имя(...)" (not "функция")
        const functionMatch = trimmed.match(/^фн\s+([a-zA-Zа-яА-Я_][a-zA-Zа-яА-Я0-9_]*)\s*\(/);
        if (functionMatch) {
          functions.push(functionMatch[1]);
          console.log(`🔍 ERROR: Found function: ${functionMatch[1]}`);
        }
        
        // Look for class definitions: "класс имя"
        const classMatch = trimmed.match(/^класс\s+([a-zA-Zа-яА-Я_][a-zA-Zа-яА-Я0-9_]*)/);
        if (classMatch) {
          classes.push(classMatch[1]);
          console.log(`🔍 ERROR: Found class: ${classMatch[1]}`);
        }
      }
      
      // Extract module name from path
      const moduleName = modulePath.split('::').pop() || '';
      
      return {
        classes,
        functions,
        modules: [moduleName]
      };
    } catch (error) {
      console.error(`🔍 ERROR: Error reading ${defFilePath}:`, error);
      return null;
    }
  }

  private useFallbackModuleDefinition(modulePath: string): void {
    // Fallback definitions when file reading fails
    const fallbackDefinitions: { [key: string]: { classes: string[], functions: string[], modules: string[] } } = {
      'стд::вывод': {
        classes: [],
        functions: ['строка', 'кс', 'байт', 'цел64', 'вещ64', 'слово64', 'лог', 'символ', 'ф'],
        modules: ['вывод']
      }
    };

    const moduleInfo = fallbackDefinitions[modulePath];
    if (moduleInfo) {
      const importData = {
        classes: new Set<string>(moduleInfo.classes),
        functions: new Set<string>(moduleInfo.functions),
        modules: new Set<string>(moduleInfo.modules)
      };
      
      this.context.importedModules.set(modulePath, importData);
      console.log(`🔍 ERROR: Parsed module ${modulePath}: ${moduleInfo.classes.length} classes, ${moduleInfo.functions.length} functions, ${moduleInfo.modules.length} modules`);
      
      // Add imported classes as available variables
      moduleInfo.classes.forEach((className: string) => {
        this.context.declaredVariables.set(className, {
          type: 'ImportedClass',
          line: -1,
          scope: 0 // Global scope
        });
      });
      
      // Add imported modules as available namespaces for qualified calls
      moduleInfo.modules.forEach((moduleName: string) => {
        this.context.declaredVariables.set(moduleName, {
          type: 'ImportedModule',
          line: -1,
          scope: 0 // Global scope
        });
      });
      
    } else {
      console.warn(`🔍 ERROR: Unknown module: ${modulePath}`);
      // For unknown modules, assume they provide something to avoid false errors
      this.context.importedModules.set(modulePath, {
        classes: new Set(),
        functions: new Set(),
        modules: new Set()
      });
    }
  }

  private detectUndeclaredIdentifiers(): void {
    console.log('🔍 ERROR: Phase 2 - Detecting undeclared identifiers (import-aware)');
    
    for (let i = 0; i < this.tokens.length; i++) {
      const token = this.tokens[i];
      
      if (token.tokenType === 'IDENTIFIER' || token.tokenType === 'variable.user') {
        // Skip if it's a declaration (including module names)
        if (this.isDeclarationContext(token)) {
          console.log(`🔍 ERROR: ✅ Skipping declaration context: ${token.value}`);
          continue;
        }
        
        // Check for member access (class.method) - handle both class and method
        if (this.isMemberAccess(token, i)) {
          const { className, methodName } = this.parseMemberAccess(token, i);
          console.log(`🔍 ERROR: Checking member access: ${className}.${methodName}`);
          
          // Check if className is an imported class
          const isImportedClass = this.isImportedClass(className);
          if (isImportedClass) {
            console.log(`🔍 ERROR: ✅ ${className} is imported class, skipping errors for both class and method`);
            // Skip the next token (dot) and the method name token as well
            i += 2; // Skip dot and method name
            continue;
          }
          
          // If not imported, check if class is declared
          if (!this.context.declaredVariables.has(className) && !this.isBuiltinVariable(className)) {
            this.addError({
              line: token.startLine + 1, // Convert to 1-based for Monaco
              column: token.startColumn + 1,
              endLine: token.endLine + 1,
              endColumn: token.endColumn + 1,
              message: `Класс '${className}' не объявлен`,
              severity: 'error',
              errorType: 'undeclared',
              code: 'undeclared-class'
            });
          }
          continue;
        }
        
        // Check if this token is a method name after a dot (so we don't double-check it)
        if (this.isMethodAfterDot(token, i)) {
          console.log(`🔍 ERROR: ✅ Skipping method token after dot: ${token.value}`);
          continue;
        }
        
                // Skip tokens that are methods of imported classes
        if (this.isImportedClassMethod(token, i)) {
          console.log(`🔍 ERROR: ✅ Skipping imported class method: ${token.value}`);
          continue;
        }
        
        // Generic debug for any unrecognized token that might be an imported function
        if (!this.context.declaredVariables.has(token.value) && 
            !this.isBuiltinVariable(token.value) && 
            !this.isImportedClass(token.value)) {
          console.log(`🔍 ERROR: DEBUG: Unrecognized token '${token.value}' at index ${i} - checking import patterns`);
          
          // Check for any module.function pattern dynamically
          for (let k = Math.max(0, i - 5); k <= i; k++) {
            // Check 3-token pattern: module . function
            if (k + 2 < this.tokens.length) {
              const moduleToken = this.tokens[k];
              const dotToken = this.tokens[k + 1];  
              const functionToken = this.tokens[k + 2];
              
              if (dotToken.value === '.' && functionToken.value === token.value) {
                console.log(`🔍 ERROR: DEBUG: Found dot pattern: ${moduleToken.value}.${functionToken.value}`);
                if (this.isImportedModule(moduleToken.value) && this.isImportedModuleMethod(moduleToken.value, functionToken.value)) {
                  console.log(`🔍 ERROR: DEBUG: ✅ Confirmed import pattern: ${moduleToken.value}.${functionToken.value}`);
                }
              }
            }
            
            // Check 2-token pattern: module function (adjacent)
            if (k + 1 < this.tokens.length) {
              const moduleToken = this.tokens[k];
              const functionToken = this.tokens[k + 1];
              
              if (functionToken.value === token.value) {
                console.log(`🔍 ERROR: DEBUG: Found adjacent pattern: ${moduleToken.value} ${functionToken.value}`);
                if (this.isImportedModule(moduleToken.value) && this.isImportedModuleMethod(moduleToken.value, functionToken.value)) {
                  console.log(`🔍 ERROR: DEBUG: ✅ Confirmed adjacent import pattern: ${moduleToken.value} ${functionToken.value}`);
                }
              }
            }
          }
        }
        
        // Check if it's a function call
        if (this.isFunctionCall(token)) {
          if (!this.context.declaredFunctions.has(token.value) && 
              !this.isBuiltinFunction(token.value) && 
              !this.isImportedFunction(token.value)) {
            this.addError({
              line: token.startLine + 1, // Convert to 1-based for Monaco
              column: token.startColumn + 1,
              endLine: token.endLine + 1,
              endColumn: token.endColumn + 1,
              message: `Функция '${token.value}' не объявлена`,
              severity: 'error',
              errorType: 'undeclared',
              code: 'undeclared-function'
            });
          }
        } else {
          // Check if it's a variable reference
          if (!this.context.declaredVariables.has(token.value) && 
              !this.isBuiltinVariable(token.value) && 
              !this.isImportedClass(token.value)) {
            this.addError({
              line: token.startLine + 1, // Convert to 1-based for Monaco
              column: token.startColumn + 1,
              endLine: token.endLine + 1,
              endColumn: token.endColumn + 1,
              message: `Переменная '${token.value}' не объявлена`,
              severity: 'error',
              errorType: 'undeclared',
              code: 'undeclared-variable'
            });
          }
        }
      }
    }
  }

  private isMethodAfterDot(token: TrivilToken, index: number): boolean {
    // Check if previous token is a dot
    if (index > 0) {
      const prevToken = this.tokens[index - 1];
      return prevToken.value === '.';
    }
    return false;
  }

  private isMemberAccess(token: TrivilToken, index: number): boolean {
    // Check if next token is a dot
    if (index + 1 < this.tokens.length) {
      const nextToken = this.tokens[index + 1];
      return nextToken.value === '.';
    }
    return false;
  }

  private parseMemberAccess(token: TrivilToken, index: number): { className: string; methodName: string } {
    const className = token.value;
    let methodName = '';
    
    // Look for the method name after the dot
    if (index + 2 < this.tokens.length) {
      const methodToken = this.tokens[index + 2];
      methodName = methodToken.value;
    }
    
    return { className, methodName };
  }

  private isImportedClass(className: string): boolean {
    // Check if any imported module provides this class
    const modules = Array.from(this.context.importedModules.values());
    console.log(`🔍 ERROR: Checking if '${className}' is imported class. Available modules:`, Array.from(this.context.importedModules.keys()));
    for (const moduleData of modules) {
      console.log(`🔍 ERROR: Module classes:`, Array.from(moduleData.classes));
      if (moduleData.classes.has(className)) {
        console.log(`🔍 ERROR: ✅ Found '${className}' in imported modules`);
        return true;
      }
    }
    console.log(`🔍 ERROR: ❌ '${className}' not found in imported modules`);
    return false;
  }

  private isImportedFunction(functionName: string): boolean {
    // Check if any imported module provides this function
    const modules = Array.from(this.context.importedModules.values());
    for (const moduleData of modules) {
      if (moduleData.functions.has(functionName)) {
        return true;
      }
    }
    return false;
  }

  private isImportedModule(moduleName: string): boolean {
    // Check if any imported module provides this module name
    console.log(`🔍 ERROR: Checking if '${moduleName}' is imported module`);
    const modules = Array.from(this.context.importedModules.values());
    console.log(`🔍 ERROR: Available module data:`, modules.map(m => `classes: [${Array.from(m.classes)}], functions: [${Array.from(m.functions)}], modules: [${Array.from(m.modules)}]`));
    
    for (const moduleData of modules) {
      console.log(`🔍 ERROR: Checking module data: modules=${Array.from(moduleData.modules)}`);
      if (moduleData.modules.has(moduleName)) {
        console.log(`🔍 ERROR: ✅ Found imported module: ${moduleName}`);
        return true;
      }
    }
    console.log(`🔍 ERROR: ❌ Module '${moduleName}' not found in imported modules`);
    return false;
  }

  private isStandardClassMethod(className: string, methodName: string): boolean {
    // Check if this is actually a class with methods
    const modules = Array.from(this.context.importedModules.values());
    for (const moduleData of modules) {
      if (moduleData.classes.has(className)) {
        // This is a real class - use hardcoded method definitions for now
        const standardMethods = new Map([
          ['Сборщик', new Set(['ф', 'строка', 'длина'])],
        ]);
        const classMethods = standardMethods.get(className);
        return classMethods ? classMethods.has(methodName) : false;
      }
    }
    return false;
  }

  private isImportedModuleMethod(moduleName: string, methodName: string): boolean {
    // Check if this is a module.function call like вывод.ф
    console.log(`🔍 ERROR: isImportedModuleMethod checking: ${moduleName}.${methodName}`);
    const modules = Array.from(this.context.importedModules.values());
    console.log(`🔍 ERROR: Available modules data:`, modules.length);
    
    for (const moduleData of modules) {
      console.log(`🔍 ERROR: Checking module: modules=[${Array.from(moduleData.modules)}], functions=[${Array.from(moduleData.functions)}]`);
      if (moduleData.modules.has(moduleName)) {
        console.log(`🔍 ERROR: Module '${moduleName}' found, checking function '${methodName}'`);
        if (moduleData.functions.has(methodName)) {
          console.log(`🔍 ERROR: ✅ Found module method: ${moduleName}.${methodName}`);
          return true;
        } else {
          console.log(`🔍 ERROR: ❌ Function '${methodName}' not found in module '${moduleName}'`);
        }
      } else {
        console.log(`🔍 ERROR: ❌ Module '${moduleName}' not found`);
      }
    }
    console.log(`🔍 ERROR: ❌ Module method ${moduleName}.${methodName} not found`);
    return false;
  }

  private enhanceTokenTypesWithImports(): void {
    console.log('🎯 ENHANCE: Starting token type enhancement with import information');
    
    for (let i = 0; i < this.tokens.length; i++) {
      const token = this.tokens[i];
      
      // Skip if already has a specific type (not generic identifier)
      if (token.tokenType !== 'IDENTIFIER' && token.tokenType !== 'variable.user') {
        continue;
      }
      
      // Check if this token is an imported function in a call pattern
      if (this.isImportedClassMethod(token, i)) {
        console.log(`🎯 ENHANCE: Token '${token.value}' is imported function, updating type`);
        token.tokenType = 'function.imported';
        continue;
      }
      
      // Check if this token is a standalone imported function
      if (this.isImportedFunction(token.value)) {
        console.log(`🎯 ENHANCE: Token '${token.value}' is standalone imported function, updating type`);
        token.tokenType = 'function.imported';
        continue;
      }
      
      // Check if this token is an imported module name
      if (this.isImportedModule(token.value)) {
        console.log(`🎯 ENHANCE: Token '${token.value}' is imported module, updating type`);
        token.tokenType = 'class.imported'; // Modules are treated like classes for highlighting
        continue;
      }
      
      // Check if this token is an imported class
      if (this.isImportedClass(token.value)) {
        console.log(`🎯 ENHANCE: Token '${token.value}' is imported class, updating type`);
        token.tokenType = 'class.imported';
        continue;
      }
    }
    
    console.log('🎯 ENHANCE: Token type enhancement completed');
  }

  private isImportedClassMethod(token: TrivilToken, index: number): boolean {
    // Check if this token is a method called on an imported class or module
    // Pattern: importedClass.method OR importedModule.function
    console.log(`🔍 ERROR: isImportedClassMethod called for token '${token.value}' at index ${index}`);
    
    // Check multiple possible patterns to handle different tokenization
    for (let offset = 1; offset <= 5; offset++) {
      if (index >= offset + 1) {
        const prevTokens = [];
        for (let i = 0; i <= offset; i++) {
          prevTokens.push(this.tokens[index - offset + i]);
        }
        
        console.log(`🔍 ERROR: Checking pattern at offset ${offset}:`, prevTokens.map(t => `"${t.value}"`).join(' '));
        
                  // Look for patterns like: name . method OR name method (adjacent)
          for (let i = 0; i < prevTokens.length - 1; i++) {
            const nameToken = prevTokens[i];
            const nextToken = prevTokens[i + 1];
            
            // Pattern 1: name . method (with explicit dot)
            if (i + 2 < prevTokens.length) {
              const dotToken = prevTokens[i + 1];
              const methodToken = prevTokens[i + 2];
              
              if (dotToken.value === '.' && methodToken.value === token.value) {
                console.log(`🔍 ERROR: Found dot pattern: '${nameToken.value}' '${dotToken.value}' '${methodToken.value}'`);
                
                // Check if it's a class method
                if (this.isImportedClass(nameToken.value)) {
                  console.log(`🔍 ERROR: '${nameToken.value}' is imported class, checking method '${token.value}'`);
                  return this.isStandardClassMethod(nameToken.value, token.value);
                }
                
                // Check if it's a module function (like вывод.ф)
                if (this.isImportedModule(nameToken.value)) {
                  console.log(`🔍 ERROR: '${nameToken.value}' is imported module, checking function '${token.value}'`);
                  return this.isImportedModuleMethod(nameToken.value, token.value);
                }
              }
            }
            
            // Pattern 2: name method (adjacent tokens, no explicit dot)
            if (nextToken.value === token.value) {
              console.log(`🔍 ERROR: Found adjacent pattern: '${nameToken.value}' '${nextToken.value}'`);
              
              // Check if it's a module function (like вывод ф without explicit dot)
              if (this.isImportedModule(nameToken.value)) {
                console.log(`🔍 ERROR: '${nameToken.value}' is imported module (adjacent), checking function '${token.value}'`);
                return this.isImportedModuleMethod(nameToken.value, token.value);
              }
              
              // Check if it's a class method
              if (this.isImportedClass(nameToken.value)) {
                console.log(`🔍 ERROR: '${nameToken.value}' is imported class (adjacent), checking method '${token.value}'`);
                return this.isStandardClassMethod(nameToken.value, token.value);
              }
            }
          }
      }
    }
    
    console.log(`🔍 ERROR: No valid import pattern found for '${token.value}'`);
    return false;
  }

  private detectTypeErrors(): void {
    console.log('🔍 ERROR: Phase 3 - Detecting type errors');
    
    for (let i = 0; i < this.tokens.length; i++) {
      const token = this.tokens[i];
      
      // Function call type checking
      if (this.isFunctionCall(token)) {
        const funcInfo = this.context.declaredFunctions.get(token.value);
        if (funcInfo) {
          const actualParams = this.extractCallParameters(i);
          
          if (actualParams.length !== funcInfo.params.length) {
            this.addError({
              line: token.startLine + 1,
              column: token.startColumn + 1,
              endLine: token.endLine + 1,
              endColumn: token.endColumn + 1,
              message: `Функция '${token.value}' ожидает ${funcInfo.params.length} параметров, получено ${actualParams.length}`,
              severity: 'error',
              errorType: 'parameter',
              code: 'parameter-count-mismatch'
            });
          }
        }
      }
      
      // Assignment type checking
      if (token.value === '=' && i > 0) {
        const leftToken = this.tokens[i - 1];
        if (leftToken.tokenType === 'IDENTIFIER' || leftToken.tokenType === 'variable.user') {
          const varInfo = this.context.declaredVariables.get(leftToken.value);
          if (varInfo) {
            const rightType = this.inferExpressionType(i + 1);
            if (rightType && varInfo.type !== rightType && !this.areTypesCompatible(varInfo.type, rightType)) {
              this.addError({
                line: leftToken.startLine + 1,
                column: leftToken.startColumn + 1,
                endLine: leftToken.endLine + 1,
                endColumn: leftToken.endColumn + 1,
                message: `Несовместимые типы: нельзя присвоить '${rightType}' переменной типа '${varInfo.type}'`,
                severity: 'error',
                errorType: 'type',
                code: 'type-mismatch'
              });
            }
          }
        }
      }
    }
  }

  private detectScopeErrors(): void {
    console.log('🔍 ERROR: Phase 4 - Detecting scope errors');
    
    for (const token of this.tokens) {
      if (token.tokenType === 'IDENTIFIER' || token.tokenType === 'variable.user') {
        const varInfo = this.context.declaredVariables.get(token.value);
        if (varInfo) {
          const currentScope = this.getCurrentScope(token.startLine);
          if (!this.isVariableInScope(varInfo.scope, currentScope, token.startLine)) {
            this.addError({
              line: token.startLine + 1,
              column: token.startColumn + 1,
              endLine: token.endLine + 1,
              endColumn: token.endColumn + 1,
              message: `Переменная '${token.value}' недоступна в данной области видимости`,
              severity: 'error',
              errorType: 'scope',
              code: 'out-of-scope'
            });
          }
        }
      }
    }
  }

  private detectParameterErrors(): void {
    console.log('🔍 ERROR: Phase 5 - Detecting parameter errors');
    
    for (let i = 0; i < this.tokens.length; i++) {
      const token = this.tokens[i];
      
      if (this.isFunctionCall(token)) {
        const funcInfo = this.context.declaredFunctions.get(token.value);
        if (funcInfo && funcInfo.params.length > 0) {
          const actualParams = this.extractCallParameters(i);
          
          for (let j = 0; j < Math.min(actualParams.length, funcInfo.params.length); j++) {
            const expectedType = funcInfo.params[j].type;
            const actualType = this.inferParameterType(actualParams[j]);
            
            if (actualType && !this.areTypesCompatible(expectedType, actualType)) {
              const paramToken = actualParams[j];
              this.addError({
                line: paramToken.startLine + 1,
                column: paramToken.startColumn + 1,
                endLine: paramToken.endLine + 1,
                endColumn: paramToken.endColumn + 1,
                message: `Параметр ${j + 1} функции '${token.value}' ожидает тип '${expectedType}', получен '${actualType}'`,
                severity: 'error',
                errorType: 'parameter',
                code: 'parameter-type-mismatch'
              });
            }
          }
        }
      }
    }
  }

  private detectSyntaxErrors(code: string): void {
    console.log('🔍 ERROR: Phase 6 - Detecting syntax errors');
    
    const lines = code.split('\n');
    
    // Check for basic syntax patterns (but be lenient with semicolons since Trivil allows newlines)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNum = i + 1;
      
      // Skip semicolon checks - Trivil allows both semicolons and newlines as statement delimiters
      // Only check for more serious syntax issues
      
      // Check for unmatched braces (simplified)
      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;
      if (openBraces !== closeBraces && (openBraces > 0 || closeBraces > 0)) {
        // This is a simplified check - a full parser would track brace matching across lines
        console.log(`🔍 ERROR: Potential brace mismatch on line ${lineNum}: ${openBraces} open, ${closeBraces} close`);
      }
      
      // Only check for truly malformed syntax, not missing semicolons
      // For example, unclosed strings or parentheses within the same line
      const unclosedStrings = (line.match(/"/g) || []).length % 2;
      if (unclosedStrings !== 0 && !line.includes('//')) {
        this.addError({
          line: lineNum,
          column: 1,
          endLine: lineNum,
          endColumn: line.length + 1,
          message: 'Незакрытая строка',
          severity: 'error',
          errorType: 'syntax',
          code: 'unclosed-string'
        });
      }
    }
  }

  // Helper methods
  private addError(error: TrivilError): void {
    this.errors.push(error);
  }

  private isDeclarationContext(token: TrivilToken): boolean {
    const index = this.tokens.indexOf(token);
    if (index <= 0) return false;
    
    const prevToken = this.tokens[index - 1];
    // Include module declarations
    return prevToken.value === 'пусть' || prevToken.value === 'фн' || prevToken.value === 'модуль';
  }

  private isFunctionCall(token: TrivilToken): boolean {
    const index = this.tokens.indexOf(token);
    if (index >= this.tokens.length - 1) return false;
    
    const nextToken = this.tokens[index + 1];
    return nextToken.value === '(';
  }

  private isBuiltinFunction(name: string): boolean {
    const builtins = ['вывод', 'ввод', 'размер', 'длина'];
    return builtins.includes(name);
  }

  private isBuiltinVariable(name: string): boolean {
    const builtins = ['истина', 'ложь', 'пусто'];
    return builtins.includes(name);
  }

  private extractFunctionParams(startIndex: number): Array<{ name: string; type: string }> {
    // Simplified parameter extraction
    const params: Array<{ name: string; type: string }> = [];
    let i = startIndex + 2; // Skip 'фн' and function name
    
    while (i < this.tokens.length && this.tokens[i].value !== ')') {
      const token = this.tokens[i];
      if (token.tokenType === 'IDENTIFIER' || token.tokenType === 'variable.user') {
        const name = token.value;
        let type = 'Цел64'; // Default type
        
        // Look for type annotation
        if (i + 2 < this.tokens.length && this.tokens[i + 1].value === ':') {
          type = this.tokens[i + 2].value;
          i += 3;
        } else {
          i++;
        }
        
        params.push({ name, type });
      } else {
        i++;
      }
    }
    
    return params;
  }

  private extractReturnType(startIndex: number): string {
    // Look for return type after function parameters
    for (let i = startIndex; i < this.tokens.length; i++) {
      if (this.tokens[i].value === ':' && i + 1 < this.tokens.length) {
        const nextToken = this.tokens[i + 1];
        if (this.context.availableTypes.has(nextToken.value)) {
          return nextToken.value;
        }
      }
      if (this.tokens[i].value === '{') break;
    }
    return 'Пусто';
  }

  private inferVariableTypeFromDeclaration(startIndex: number): string {
    // Look for explicit type or infer from assignment
    for (let i = startIndex + 2; i < this.tokens.length && i < startIndex + 10; i++) {
      const token = this.tokens[i];
      
      if (token.value === ':' && i + 1 < this.tokens.length) {
        return this.tokens[i + 1].value;
      }
      
      if (token.value === '=' && i + 1 < this.tokens.length) {
        return this.inferExpressionType(i + 1) || 'Цел64';
      }
      
      if (token.value === ';') break;
    }
    
    return 'Цел64'; // Default
  }

  private inferExpressionType(startIndex: number): string | null {
    if (startIndex >= this.tokens.length) return null;
    
    const token = this.tokens[startIndex];
    
    // Number literal
    if (token.tokenType === 'NUMBER' || token.tokenType === 'number') {
      return token.value.includes('.') ? 'Дщб64' : 'Цел64';
    }
    
    // String literal
    if (token.tokenType === 'STRING' || token.tokenType === 'string') {
      return 'Стр';
    }
    
    // Function call
    if (this.isFunctionCall(token)) {
      const funcInfo = this.context.declaredFunctions.get(token.value);
      return funcInfo?.returnType || 'Пусто';
    }
    
    // Variable reference
    if (token.tokenType === 'IDENTIFIER' || token.tokenType === 'variable.user') {
      const varInfo = this.context.declaredVariables.get(token.value);
      return varInfo?.type || null;
    }
    
    return null;
  }

  private getCurrentScope(line: number): number {
    // Simplified scope calculation based on line number
    return Math.floor(line / 20); // Group every 20 lines as a scope
  }

  private isVariableInScope(declaredScope: number, currentScope: number, currentLine: number): boolean {
    // Simplified scope checking
    return declaredScope <= currentScope;
  }

  private areTypesCompatible(expected: string, actual: string): boolean {
    if (expected === actual) return true;
    
    // Some basic type compatibility rules
    if (expected === 'Дщб64' && actual === 'Цел64') return true;
    if (expected === 'Стр' && (actual === 'string' || actual === 'STRING')) return true;
    
    return false;
  }

  private extractCallParameters(startIndex: number): TrivilToken[] {
    const params: TrivilToken[] = [];
    let i = startIndex + 1; // Skip function name
    
    // Find opening parenthesis
    while (i < this.tokens.length && this.tokens[i].value !== '(') i++;
    i++; // Skip '('
    
    // Collect parameters until closing parenthesis
    while (i < this.tokens.length && this.tokens[i].value !== ')') {
      const token = this.tokens[i];
      if (token.value !== ',' && token.value.trim() !== '') {
        params.push(token);
      }
      i++;
    }
    
    return params;
  }

  private inferParameterType(token: TrivilToken): string | null {
    return this.inferExpressionType(this.tokens.indexOf(token));
  }
}

// Error suppression for clipboard issues
function implementComprehensiveErrorSuppression(): void {
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  
  const clipboardErrorPatterns = [
    /navigator\.clipboard/i,
    /clipboard.*permission/i,
    /clipboard.*not.*allowed/i,
    /NotAllowedError.*clipboard/i,
    /writeText.*not.*allowed/i,
    /readText.*not.*allowed/i,
    /clipboard.*api.*not.*available/i,
    /Document is not focused/i,
    /clipboard.*operation.*denied/i,
    /User activation is required/i,
    /writeText.*requires.*user.*activation/i,
    /readText.*requires.*user.*activation/i,
    /The request is not allowed by the user agent/i,
    /clipboard.*denied/i,
    /writeText.*permission.*denied/i,
    /readText.*permission.*denied/i,
    /Clipboard.*access.*denied/i,
    /clipboard.*operation.*not.*permitted/i,
    /navigator\.permissions.*clipboard/i,
    /clipboard.*write.*permission/i,
    /clipboard.*read.*permission/i
  ];

  function shouldSuppressError(args: any[]): boolean {
    const message = args.join(' ').toLowerCase();
    return clipboardErrorPatterns.some(pattern => pattern.test(message));
  }

  console.error = (...args: any[]) => {
    if (!shouldSuppressError(args)) {
      originalConsoleError.apply(console, args);
    }
  };

  console.warn = (...args: any[]) => {
    if (!shouldSuppressError(args)) {
      originalConsoleWarn.apply(console, args);
    }
  };

  const originalOnError = window.onerror;
  window.onerror = (message, source, lineno, colno, error) => {
    if (typeof message === 'string' && shouldSuppressError([message])) {
      return true;
    }
    if (originalOnError) {
      return originalOnError(message, source, lineno, colno, error);
    }
    return false;
  };

  const originalOnUnhandledRejection = window.onunhandledrejection;
  window.onunhandledrejection = (event) => {
    if (event.reason && shouldSuppressError([String(event.reason)])) {
      event.preventDefault();
      return;
    }
    if (originalOnUnhandledRejection) {
      originalOnUnhandledRejection.call(window, event);
    }
  };
}

// Initialize error suppression
implementComprehensiveErrorSuppression(); 