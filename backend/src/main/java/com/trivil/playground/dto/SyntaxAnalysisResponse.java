package com.trivil.playground.dto;

import java.util.List;

public record SyntaxAnalysisResponse(
        boolean success,
        List<SyntaxToken> tokens,
        String error,
        long analysisTimeMs) {

    public static SyntaxAnalysisResponse success(List<SyntaxToken> tokens, long analysisTimeMs) {
        return new SyntaxAnalysisResponse(true, tokens, null, analysisTimeMs);
    }

    public static SyntaxAnalysisResponse error(String error, long analysisTimeMs) {
        return new SyntaxAnalysisResponse(false, List.of(), error, analysisTimeMs);
    }
}