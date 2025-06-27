package com.trivil.playground.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record CompileResponse(
        boolean success,
        String output,
        String error,
        Long executionTimeMs,
        String resultType
) {

    public static CompileResponse success(String output, long executionTimeMs) {
        return new CompileResponse(
                true,
                output,
                null,
                executionTimeMs,
                "success");
    }

    public static CompileResponse compilationError(String error) {
        return new CompileResponse(
                false,
                null,
                error,
                null,
                "compilation_error");
    }

    public static CompileResponse runtimeError(String error, long executionTimeMs) {
        return new CompileResponse(
                false,
                null,
                error,
                executionTimeMs,
                "runtime_error");
    }

    public static CompileResponse timeout(String message) {
        return new CompileResponse(
                false,
                null,
                message,
                null,
                "timeout");
    }
}