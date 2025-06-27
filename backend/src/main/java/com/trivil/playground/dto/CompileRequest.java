package com.trivil.playground.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CompileRequest(
    @NotBlank(message = "Source code cannot be blank")
    @Size(max = 10000, message = "Source code cannot exceed 10,000 characters")
    String sourceCode
) {
    
    public String sanitizedSourceCode() {
        if (sourceCode == null) {
            return "";
        }
        
        return sourceCode
            .trim()
            .replace("\0", "")
            .replace("\r\n", "\n")
            .replace("\r", "\n");
    }
} 