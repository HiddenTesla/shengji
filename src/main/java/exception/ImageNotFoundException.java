package exception;

// I could have used java.io.FileNotFoundException,
// but it has to been declared throws.
// So I implement another from RuntimeException
public class ImageNotFoundException extends RuntimeException {
    public ImageNotFoundException() {
        super();
    }

    public ImageNotFoundException(String message) {
        super(message);
    }
}
