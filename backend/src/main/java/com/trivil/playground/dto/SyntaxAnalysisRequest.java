package com.trivil.playground.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record SyntaxAnalysisRequest(
        @NotNull(message = "Source code cannot be null")
        @Size(max = 10_000, message = "Source code cannot exceed 10KB") 
        String sourceCode,
        int position) {
        }