#include <stdio.h>

int main(void) {
    int count = "not a number"; // BUG
    undeclared_function(count);
    return 0;
}
