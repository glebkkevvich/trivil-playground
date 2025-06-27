package com.trivil.playground.dto;


public record SyntaxToken(
    int startLine,
    int startColumn, 
    int endLine,
    int endColumn,
    String tokenType,
    String value,
    String semanticInfo
) {
    public enum TokenType {
        KEYWORD,
        IDENTIFIER,
        USER_VARIABLE,
        USER_FUNCTION,
        IMPORTED_CLASS,
        IMPORTED_FUNCTION,
        BUILT_IN_TYPE,
        BUILT_IN_FUNCTION,
        STRING_LITERAL,
        NUMBER_LITERAL,
        COMMENT,
        OPERATOR,
        PUNCTUATION,
        WHITESPACE,
        ERROR
    }
} 